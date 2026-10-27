/**
 * Service TaxInvoice — faktur pajak keluaran & masukan (F-001/F-002).
 *
 * Invarian backend: prisma.$transaction utk compound write,
 * `assertPeriodOpen` DALAM tx, idempotency key finansial persisten,
 * akun setting/COA fail-closed, Decimal presisi (tanpa Number() mentah
 * di hitung DPP/PPN), no silent catch.
 *
 * Batasan vonis:
 * - Jurnal komersial asal TIDAK diubah/dihapus oleh pengganti/batal.
 * - Pengganti/batal DITOLAK bila masa asal terkunci tanpa jalur pembetulan.
 * - Field lama `SalesInvoice.taxInvoiceNumber` / `VendorBill.taxInvoiceNumber`
 *   = cermin nomor KEPALA rantai (backfill dari TaxInvoice), bukan sumber
 *   kebenaran.
 * - Unik (vendorId, nomor) masukan non-batal: partial unique tak portabel
 *   MySQL → guard service + index komposit; duplikat kredit = tolak keras.
 */
import { createHash } from "node:crypto"

import { Prisma } from "@prisma/client"
import { prisma, type TxClient } from "@/lib/db/prisma"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import {
  claimIdempotencyKey,
  bindIdempotencyKey,
  isValidIdempotencyKey,
  isDefinitiveError,
  definitive,
  payloadFingerprint,
  type IdemScope,
} from "@/lib/services/financial-idempotency.service"
import { getErrorMessage } from "@/lib/utils/error"
import { buildUniqueSlug } from "@/lib/utils/slug"
import {
  computeVatFromSellingPrice,
  taxPeriodFromDate,
  checkCreditEligibility,
  creditableSplit,
  normalizeTransactionCode,
  NON_CREDITABLE_REASONS,
  type TransactionCode,
  type TransactionCodeHint,
  pickTransactionCode,
} from "@/lib/tax/tax-invoice"
import {
  buildSettlementVat,
  snapshotFromDownPaymentRow,
} from "@/lib/tax/down-payment-vat"
import {
  evaluateTaxInvoiceIssueGate,
  snapshotCounterpartyFromMaster,
  type CounterpartySnapshot,
} from "@/lib/tax/customer-tax-identity"

const SCOPE_ISSUE: IdemScope = "tax_invoice_issue"
const SCOPE_DP_ISSUE: IdemScope = "tax_invoice_dp_issue"
const SCOPE_REPLACE: IdemScope = "tax_invoice_replace"
const SCOPE_CREDIT: IdemScope = "tax_invoice_credit"

export type TaxInvoiceResult = {
  success: boolean
  error?: string
  ambiguous?: boolean
  replayed?: boolean
  id?: number
}

function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

function toRate(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

/**
 * Slug unik di dalam tx: `prisma` global belum melihat baris tak-tercommit,
 * dua terbit berurutan dalam satu tx bisa bertabrakan di kolom @unique.
 * Cek tabrakan lewat delegate tx (pola buildUniqueSlug financial-idempotency).
 */
async function nextTxSlug(
  tx: TxClient,
  model: "taxInvoice" | "withholdingCertificate",
  base: string,
): Promise<string> {
  const d = tx[model] as unknown as {
    findFirst: (args: { where: Record<string, unknown>; select: { id: true } }) => Promise<{ id: number } | null>
  }
  return buildUniqueSlug(base, async (candidate) => (await d.findFirst({ where: { slug: candidate }, select: { id: true } })) !== null)
}

async function mirrorHeadNumber(
  tx: TxClient,
  head: { direction: string; taxInvoiceNumber: string; salesInvoiceId: number | null; vendorBillId: number | null },
): Promise<void> {
  if (head.direction === "out" && head.salesInvoiceId != null) {
    await tx.salesInvoice.update({
      where: { id: head.salesInvoiceId },
      data: { taxInvoiceNumber: head.taxInvoiceNumber },
    })
  }
  if (head.direction === "in" && head.vendorBillId != null) {
    await tx.vendorBill.update({
      where: { id: head.vendorBillId },
      data: { taxInvoiceNumber: head.taxInvoiceNumber },
    })
  }
}

export interface IssueTaxInvoiceInput {
  direction: "out" | "in"
  transactionCode?: string
  codeHint?: TransactionCodeHint
  taxInvoiceNumber: string
  taxInvoiceDate: Date
  /** Harga jual/penggantian penuh (DPP dihitung dari sini). */
  sellingPrice: number
  nominalRate?: number
  salesInvoiceId?: number | null
  vendorBillId?: number | null
  vendorId?: number | null
  counterpartyTaxId?: string | null
  counterpartyName?: string | null
  counterpartyNitku?: string | null
  /** Konfirmasi eksplisit operator: terbit dengan NPWP 15 digit (legacy) — vonis 019-V §2. */
  legacy15Confirmed?: boolean
  xmlPayload?: string | null
  idempotencyKey: string
  userId?: number
}

/**
 * Terbitkan TaxInvoice baru. taxPeriod diturunkan dari tanggal faktur;
 * DPP/PPN dihitung via computeVatFromSellingPrice (kode 04 → 11/12).
 */
export async function issueTaxInvoice(input: IssueTaxInvoiceInput): Promise<TaxInvoiceResult> {
  try {
    const number = input.taxInvoiceNumber.trim()
    if (!number) return { success: false, error: "Nomor faktur pajak wajib diisi (sistem tidak menerbitkan nomor seri sendiri)" }
    if (!(input.sellingPrice > 0)) return { success: false, error: "Harga jual/penggantian harus > 0" }
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      return { success: false, error: "Terbit faktur pajak wajib idempotency key valid" }
    }
    const code: TransactionCode = input.transactionCode
      ? normalizeTransactionCode(input.transactionCode)
      : pickTransactionCode(input.codeHint)
    let computed = computeVatFromSellingPrice(input.sellingPrice, code, input.nominalRate ?? 12)
    const taxPeriod = taxPeriodFromDate(input.taxInvoiceDate)
    const fp = payloadFingerprint({
      scope: SCOPE_ISSUE,
      direction: input.direction,
      number,
      dpp: computed.dpp.toFixed(2),
      tax: computed.taxAmount.toFixed(2),
    })
    let createdId: number | undefined
    let isReplay = false
    await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx as never, SCOPE_ISSUE, input.idempotencyKey, input.userId, fp)
      if (claim.replayed) {
        isReplay = true
        createdId = claim.resultRefId ?? undefined
        return
      }
      await assertPeriodOpen(input.taxInvoiceDate, tx as never)
      // F-2026-10-25-004-V: FP pelunasan atas faktur ber-FP UM tertaut
      // WAJIB snapshot SELISIH (dokumen penuh - Sigma FP UM aktif pada
      // quotation yang sama) supaya SPT tidak dobel. Tanpa FP UM
      // tertaut, angka computed existing dipakai persis.
      if (input.direction === "out" && input.salesInvoiceId != null) {
        const linkedInvoice = await tx.salesInvoice.findUnique({
          where: { id: input.salesInvoiceId },
          select: { quotationId: true },
        })
        if (linkedInvoice?.quotationId != null) {
          const fpUmRows = await tx.taxInvoice.findMany({
            where: {
              direction: "out",
              downPayment: { quotationId: linkedInvoice.quotationId },
              djpStatus: { notIn: ["cancelled", "replaced"] },
            },
            select: { dpp: true, taxAmount: true },
          })
          if (fpUmRows.length > 0) {
            const settlement = buildSettlementVat({
              documentDpp: computed.dpp,
              documentPpn: computed.taxAmount,
              uangMuka: fpUmRows.map((r) => ({
                dppUangMuka: Number(r.dpp),
                ppnUangMuka: Number(r.taxAmount),
              })),
            })
            computed = { ...computed, dpp: settlement.settlementDpp, taxAmount: settlement.settlementPpn }
          }
        }
      }
      const dupe = await tx.taxInvoice.findFirst({
        where: { direction: input.direction, taxInvoiceNumber: number },
        select: { id: true },
      })
      if (dupe) throw definitive(`Nomor faktur pajak "${number}" sudah terbit untuk arah ${input.direction}`)
      if (input.direction === "in") {
        if (input.vendorId == null) throw definitive("Faktur masukan wajib vendor")
        const dupeVendor = await tx.taxInvoice.findFirst({
          where: { direction: "in", vendorId: input.vendorId, taxInvoiceNumber: number, djpStatus: { not: "cancelled" } },
          select: { id: true },
        })
        if (dupeVendor) throw definitive(`Duplikat faktur masukan (vendor #${input.vendorId}, nomor "${number}") ditolak`)
      }
      // F-2026-10-25-004-S (vonis 019-V §5 + putusan Lead §8A-5): arah out —
      // snapshot dari master pelanggan faktur penjualan tertaut (koreksi
      // operator per-field menang), lalu gerbang EC-3 server-side untuk
      // SEMUA terbit out (tertaut maupun manual). Arah in tidak diubah.
      let snapshot: CounterpartySnapshot = {
        counterpartyTaxId: input.counterpartyTaxId ?? null,
        counterpartyName: input.counterpartyName ?? null,
        counterpartyNitku: input.counterpartyNitku ?? null,
      }
      if (input.direction === "out") {
        if (input.salesInvoiceId != null) {
          const si = await tx.salesInvoice.findUnique({
            where: { id: input.salesInvoiceId },
            select: { customer: { select: { taxId: true, taxpayerName: true, nitku: true } } },
          })
          if (si?.customer) {
            snapshot = snapshotCounterpartyFromMaster(si.customer, {
              counterpartyTaxId: input.counterpartyTaxId ?? undefined,
              counterpartyName: input.counterpartyName ?? undefined,
              counterpartyNitku: input.counterpartyNitku ?? undefined,
            })
          }
        }
        const gate = evaluateTaxInvoiceIssueGate(snapshot, { legacy15Confirmed: input.legacy15Confirmed })
        if (!gate.allowed) throw definitive(gate.error)
      }
      const created = await tx.taxInvoice.create({
        data: {
          slug: await nextTxSlug(tx as never, "taxInvoice", `fp-${input.direction}-${number}`),
          direction: input.direction,
          transactionCode: code,
          taxInvoiceNumber: number,
          taxInvoiceDate: input.taxInvoiceDate,
          taxPeriod,
          dpp: toMoney(computed.dpp),
          taxRate: toRate(computed.nominalRate),
          taxAmount: toMoney(computed.taxAmount),
          djpStatus: "draft",
          salesInvoiceId: input.salesInvoiceId ?? null,
          vendorBillId: input.vendorBillId ?? null,
          vendorId: input.vendorId ?? null,
          counterpartyTaxId: snapshot.counterpartyTaxId,
          counterpartyName: snapshot.counterpartyName,
          counterpartyNitku: snapshot.counterpartyNitku,
          xmlPayload: input.xmlPayload ?? null,
          // Jejak impor XML Coretax: hash isi + waktu impor, untuk rekonsiliasi
          // dobel-impor (dokumen sama tidak diterbitkan dua kali).
          xmlHash: input.xmlPayload
            ? createHash("sha256").update(input.xmlPayload).digest("hex")
            : null,
          xmlImportedAt: input.xmlPayload ? new Date() : null,
          djpMessage: input.xmlPayload ? "Diimpor dari XML Coretax" : null,
          createdBy: input.userId ?? null,
        },
      })
      await mirrorHeadNumber(tx, {
        direction: input.direction,
        taxInvoiceNumber: number,
        salesInvoiceId: input.salesInvoiceId ?? null,
        vendorBillId: input.vendorBillId ?? null,
      })
      await bindIdempotencyKey(tx as never, input.idempotencyKey, "TaxInvoice", created.id)
      createdId = created.id
    })
    return { success: true, replayed: isReplay, id: createdId }
  } catch (e) {
    return { success: false, error: getErrorMessage(e), ambiguous: !isDefinitiveError(e) }
  }
}

export interface IssueDownPaymentTaxInvoiceInput {
  downPaymentId: number
  /** Nomor seri dari DJP/Coretax, dicatat apa adanya (sistem tidak mengarang). */
  taxInvoiceNumber: string
  counterpartyTaxId?: string | null
  counterpartyName?: string | null
  counterpartyNitku?: string | null
  /** Konfirmasi eksplisit operator: terbit dengan NPWP 15 digit (legacy) — vonis 019-V §2. */
  legacy15Confirmed?: boolean
  idempotencyKey: string
  userId?: number
}

/**
 * Terbitkan FP uang muka (FP UM) untuk DP confirmed terutang
 * (F-2026-10-25-004-V Putusan 1/2): tanggal FP = paymentDate DP,
 * masa diturunkan dari tanggal itu, DPP/PPN/tarif/kode DISALIN dari
 * snapshot DP yang dibekukan saat confirm — tidak hitung ulang dari
 * input bebas. Satu FP UM aktif per DP (guard service; partial
 * unique tidak portabel di MySQL, pola service ini).
 */
export async function issueDownPaymentTaxInvoice(
  input: IssueDownPaymentTaxInvoiceInput,
): Promise<TaxInvoiceResult> {
  try {
    const number = input.taxInvoiceNumber.trim()
    if (!number) return { success: false, error: "Nomor faktur pajak wajib diisi (sistem tidak menerbitkan nomor seri sendiri)" }
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      return { success: false, error: "Terbit FP uang muka wajib idempotency key valid" }
    }
    const fp = payloadFingerprint({
      scope: SCOPE_DP_ISSUE,
      downPaymentId: input.downPaymentId,
      number,
    })
    let createdId: number | undefined
    let isReplay = false
    await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx as never, SCOPE_DP_ISSUE, input.idempotencyKey, input.userId, fp)
      if (claim.replayed) {
        isReplay = true
        createdId = claim.resultRefId ?? undefined
        return
      }
      const dp = await tx.downPayment.findUnique({
        where: { id: input.downPaymentId },
        include: { customer: { select: { name: true, taxId: true, taxpayerName: true, nitku: true } } },
      })
      if (!dp) throw definitive(`Uang muka #${input.downPaymentId} tidak ditemukan`)
      if (dp.status !== "confirmed") {
        throw definitive("FP uang muka hanya terbit untuk uang muka berstatus confirmed (terutang saat penerimaan terverifikasi)")
      }
      const snapshot = snapshotFromDownPaymentRow(dp as never)
      if (!snapshot) {
        throw definitive("Snapshot PPN uang muka belum dibekukan untuk DP ini (DP legacy pra-fitur) — FP UM tidak dapat diterbitkan dari hitungan ulang")
      }
      if (!snapshot.taxable) {
        throw definitive("DP ini bukan subjek FP uang muka (snapshot PPN nol) — tidak ada FP UM yang diterbitkan")
      }
      await assertPeriodOpen(dp.paymentDate, tx as never)
      const active = await tx.taxInvoice.findFirst({
        where: { downPaymentId: dp.id, direction: "out", djpStatus: { notIn: ["cancelled", "replaced"] } },
        select: { id: true },
      })
      if (active) throw definitive(`DP ini sudah memiliki FP uang muka aktif (#${active.id}) — satu FP UM aktif per DP`)
      const dupe = await tx.taxInvoice.findFirst({
        where: { direction: "out", taxInvoiceNumber: number },
        select: { id: true },
      })
      if (dupe) throw definitive(`Nomor faktur pajak "${number}" sudah terbit untuk arah out`)
      // B1 t_663509ae (vonis 019-V Putusan 3/5 + §8A): FP UM wajib gerbang
      // identitas SAMA dengan issueTaxInvoice — dinilai dari snapshot final
      // (override operator menang per-field atas master; taxpayerName master
      // menang atas nama dagang, nama dagang hanya fallback terakhir bila
      // taxpayerName kosong — pola snapshotCounterpartyFromMaster existing).
      const cust = dp.customer
      const finalIdentity: CounterpartySnapshot = cust
        ? snapshotCounterpartyFromMaster(
            {
              taxId: cust.taxId,
              taxpayerName: cust.taxpayerName ?? cust.name,
              nitku: cust.nitku,
            },
            {
              counterpartyTaxId: input.counterpartyTaxId ?? undefined,
              counterpartyName: input.counterpartyName ?? undefined,
              counterpartyNitku: input.counterpartyNitku ?? undefined,
            },
          )
        : {
            counterpartyTaxId: input.counterpartyTaxId ?? null,
            counterpartyName: input.counterpartyName ?? null,
            counterpartyNitku: input.counterpartyNitku ?? null,
          }
      const gate = evaluateTaxInvoiceIssueGate(finalIdentity, { legacy15Confirmed: input.legacy15Confirmed })
      if (!gate.allowed) throw definitive(gate.error)
      const created = await tx.taxInvoice.create({
        data: {
          slug: await nextTxSlug(tx as never, "taxInvoice", `fp-out-${number}`),
          direction: "out",
          transactionCode: snapshot.transactionCode,
          taxInvoiceNumber: number,
          taxInvoiceDate: dp.paymentDate,
          taxPeriod: snapshot.taxPeriod,
          dpp: toMoney(snapshot.dppUangMuka),
          taxRate: toRate(snapshot.nominalRate),
          taxAmount: toMoney(snapshot.ppnUangMuka),
          djpStatus: "draft",
          downPaymentId: dp.id,
          counterpartyTaxId: finalIdentity.counterpartyTaxId,
          counterpartyName: finalIdentity.counterpartyName,
          counterpartyNitku: finalIdentity.counterpartyNitku,
          createdBy: input.userId ?? null,
        },
      })
      await bindIdempotencyKey(tx as never, input.idempotencyKey, "TaxInvoice", created.id)
      createdId = created.id
    })
    return { success: true, replayed: isReplay, id: createdId }
  } catch (e) {
    return { success: false, error: getErrorMessage(e), ambiguous: !isDefinitiveError(e) }
  }
}

export interface ReplaceTaxInvoiceInput {
  replacesId: number
  taxInvoiceNumber: string
  taxInvoiceDate: Date
  sellingPrice: number
  replaceReason: string
  idempotencyKey: string
  userId?: number
}

/**
 * Faktur pengganti: dokumen BARU, nomor seri sama, replacesId → lama;
 * lama → `replaced`. SPT efektif: masa faktur DIGANTI (bukan masa terbit
 * pengganti) — read-model memakai kepala rantai. Jurnal komersial asal
 * TIDAK diubah. Masa asal terkunci → tolak.
 */
export async function replaceTaxInvoice(input: ReplaceTaxInvoiceInput): Promise<TaxInvoiceResult> {
  try {
    if (!input.replaceReason.trim()) return { success: false, error: "Alasan pengganti wajib diisi" }
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      return { success: false, error: "Pengganti faktur wajib idempotency key valid" }
    }
    const fp = payloadFingerprint({
      scope: SCOPE_REPLACE,
      replacesId: input.replacesId,
      number: input.taxInvoiceNumber.trim(),
      price: Number(input.sellingPrice).toFixed(2),
    })
    let createdId: number | undefined
    let isReplay = false
    await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx as never, SCOPE_REPLACE, input.idempotencyKey, input.userId, fp)
      if (claim.replayed) {
        isReplay = true
        createdId = claim.resultRefId ?? undefined
        return
      }
      await tx.$queryRaw`SELECT id FROM tax_invoices WHERE id = ${input.replacesId} FOR UPDATE`
      const old = await tx.taxInvoice.findUniqueOrThrow({ where: { id: input.replacesId } })
      if (old.djpStatus === "cancelled") throw definitive("Faktur batal tidak bisa diganti")
      if (old.djpStatus === "replaced") throw definitive("Faktur ini sudah diganti — rantai satu pengganti per faktur")
      // Pengganti memakai masa faktur DIGANTI (PER-11/PJ/2025): masa asal
      // terkunci menolak; tanggal terbit pengganti bebas (reportedAtPeriod).
      await assertPeriodOpen(old.taxInvoiceDate, tx as never)
      // Pengganti = dokumen BARU nomor seri sama: nomor input wajib sama
      // dgn nomor lama; duplikat (direction, nomor) sesudah lama `replaced`
      // digantikan unik `replacesId` + guard hidup-di-bawah.
      if (input.taxInvoiceNumber.trim() !== old.taxInvoiceNumber) {
        throw definitive("Nomor seri faktur pengganti wajib sama dengan faktur yang diganti")
      }
      const dupeNumber = await tx.taxInvoice.findFirst({
        where: {
          direction: old.direction,
          taxInvoiceNumber: old.taxInvoiceNumber,
          djpStatus: { notIn: ["cancelled", "replaced"] },
          id: { not: old.id },
        },
        select: { id: true },
      })
      if (dupeNumber) throw definitive(`Nomor faktur pajak "${old.taxInvoiceNumber}" masih dipakai faktur aktif lain`)
      const computed = computeVatFromSellingPrice(
        input.sellingPrice,
        normalizeTransactionCode(old.transactionCode),
        Number(old.taxRate),
      )
      // Terbit draft dulu supaya tak ada celah tanpa cermin; cermin kepala
      // diperbarui ke nomor pengganti bersamaan (mirrorHeadNumber).
      const created = await tx.taxInvoice.create({
        data: {
          slug: await nextTxSlug(tx as never, "taxInvoice", `fp-ganti-${input.taxInvoiceNumber.trim()}`),
          direction: old.direction,
          transactionCode: old.transactionCode,
          taxInvoiceNumber: input.taxInvoiceNumber.trim(),
          taxInvoiceDate: input.taxInvoiceDate,
          // Masa SPT = masa faktur DIGANTI (PER-11/PJ/2025), bukan masa
          // terbit pengganti. reportedAtPeriod di read-model = masa ini.
          taxPeriod: old.taxPeriod,
          dpp: toMoney(computed.dpp),
          taxRate: toRate(computed.nominalRate),
          taxAmount: toMoney(computed.taxAmount),
          djpStatus: "draft",
          salesInvoiceId: old.salesInvoiceId,
          vendorBillId: old.vendorBillId,
          vendorId: old.vendorId,
          replacesId: old.id,
          replaceReason: input.replaceReason.trim(),
          counterpartyTaxId: old.counterpartyTaxId,
          counterpartyName: old.counterpartyName,
          counterpartyNitku: old.counterpartyNitku,
          createdBy: input.userId ?? null,
        },
      })
      await tx.taxInvoice.update({ where: { id: old.id }, data: { djpStatus: "replaced" } })
      await mirrorHeadNumber(tx, {
        direction: created.direction,
        taxInvoiceNumber: created.taxInvoiceNumber,
        salesInvoiceId: created.salesInvoiceId,
        vendorBillId: created.vendorBillId,
      })
      await bindIdempotencyKey(tx as never, input.idempotencyKey, "TaxInvoice", created.id)
      createdId = created.id
    })
    return { success: true, replayed: isReplay, id: createdId }
  } catch (e) {
    return { success: false, error: getErrorMessage(e), ambiguous: !isDefinitiveError(e) }
  }
}

export interface CancelTaxInvoiceInput {
  id: number
  cancelReason: string
  idempotencyKey: string
  userId?: number
}

const SCOPE_CANCEL: IdemScope = "tax_invoice_cancel"

/**
 * Batal faktur: status `cancelled`, nomor TIDAK dipakai ulang (guard
 * `issueTaxInvoice` menolak nomor yg pernah ada walau batal), jurnal
 * komersial asal TIDAK diubah. Masa asal terkunci → tolak (koreksi lewat
 * pembetulan masa asal, bukan batal diam-diam). Cermin kepala rantai:
 * sesudah batal, cermin = faktur diganti terakhir yg masih hidup, atau
 * kosong bila tak ada.
 */
export async function cancelTaxInvoice(input: CancelTaxInvoiceInput): Promise<TaxInvoiceResult> {
  try {
    if (!input.cancelReason.trim()) return { success: false, error: "Alasan pembatalan wajib diisi" }
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      return { success: false, error: "Batal faktur wajib idempotency key valid" }
    }
    const fp = payloadFingerprint({ scope: SCOPE_CANCEL, id: input.id, reason: input.cancelReason.trim() })
    let isReplay = false
    await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx as never, SCOPE_CANCEL, input.idempotencyKey, input.userId, fp)
      if (claim.replayed) {
        isReplay = true
        return
      }
      await tx.$queryRaw`SELECT id FROM tax_invoices WHERE id = ${input.id} FOR UPDATE`
      const inv = await tx.taxInvoice.findUniqueOrThrow({ where: { id: input.id } })
      if (inv.djpStatus === "cancelled") throw definitive("Faktur ini sudah batal")
      if (inv.djpStatus === "replaced") throw definitive("Faktur ini sudah diganti — batal faktur pengganti, bukan asal")
      await assertPeriodOpen(inv.taxInvoiceDate, tx as never)
      await tx.taxInvoice.update({
        where: { id: inv.id },
        data: { djpStatus: "cancelled", replaceReason: input.cancelReason.trim() },
      })
      // Cermin kepala: faktur tertaut terbaru yg masih hidup, else kosong.
      if (inv.direction === "out" && inv.salesInvoiceId != null) {
        const head = await tx.taxInvoice.findFirst({
          where: { direction: "out", salesInvoiceId: inv.salesInvoiceId, djpStatus: { notIn: ["cancelled", "replaced"] } },
          orderBy: { id: "desc" },
          select: { taxInvoiceNumber: true },
        })
        await tx.salesInvoice.update({
          where: { id: inv.salesInvoiceId },
          data: { taxInvoiceNumber: head?.taxInvoiceNumber ?? null },
        })
      }
      if (inv.direction === "in" && inv.vendorBillId != null) {
        const head = await tx.taxInvoice.findFirst({
          where: { direction: "in", vendorBillId: inv.vendorBillId, djpStatus: { notIn: ["cancelled", "replaced"] } },
          orderBy: { id: "desc" },
          select: { taxInvoiceNumber: true },
        })
        await tx.vendorBill.update({
          where: { id: inv.vendorBillId },
          data: { taxInvoiceNumber: head?.taxInvoiceNumber ?? null },
        })
      }
      await bindIdempotencyKey(tx as never, input.idempotencyKey, "TaxInvoice", inv.id)
    })
    return { success: true, replayed: isReplay, id: input.id }
  } catch (e) {
    return { success: false, error: getErrorMessage(e), ambiguous: !isDefinitiveError(e) }
  }
}

export interface CreditInputInvoiceInput {
  id: number
  creditPeriod: string
  /** Alasan wajib bila status not_creditable. */
  nonCreditableReason?: string
  /** Porsi kreditabel utk penyerahan campur (default 100). */
  creditablePercent?: number
  idempotencyKey: string
  userId?: number
}

/**
 * Kreditkan faktur masukan pada masa pilihan. Jendela maks 3 masa sesudah
 * masa faktur — lewat → `expired`, ditolak. VendorBill tanpa nomor faktur
 * valid: PPN gabung HPP (bukan PPN Masukan) — ditegakkan pemanggil jurnal;
 * di sini hanya status kredit.
 */
export async function creditInputInvoice(input: CreditInputInvoiceInput): Promise<TaxInvoiceResult> {
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.creditPeriod)) {
      return { success: false, error: "Masa kredit harus YYYY-MM" }
    }
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      return { success: false, error: "Kredit faktur masukan wajib idempotency key valid" }
    }
    const fp = payloadFingerprint({ scope: SCOPE_CREDIT, id: input.id, creditPeriod: input.creditPeriod })
    let isReplay = false
    // B4: status `expired` adalah FAKTA yang harus tersimpan, bukan bagian
    // dari transaksi yang gagal. Menulisnya lalu `throw` di dalam
    // $transaction membuat rollback membuang status itu — faktur tertinggal
    // `uncredited` selamanya. Jadi cabang expired TIDAK melempar di dalam
    // transaksi: status ditulis, transaksi commit, baru error dikembalikan
    // ke pemanggil sesudahnya. Klaim idempotency sengaja tidak di-bind pada
    // jalur ini — retry dengan key baru menilai ulang dan menerima error
    // expired yang sama, bukan sukses replay palsu.
    let expiredError: string | undefined
    await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx as never, SCOPE_CREDIT, input.idempotencyKey, input.userId, fp)
      if (claim.replayed) {
        isReplay = true
        return
      }
      await tx.$queryRaw`SELECT id FROM tax_invoices WHERE id = ${input.id} FOR UPDATE`
      const inv = await tx.taxInvoice.findUniqueOrThrow({ where: { id: input.id } })
      if (inv.direction !== "in") throw definitive("Hanya faktur masukan yang bisa dikreditkan")
      if (inv.djpStatus === "cancelled") throw definitive("Faktur batal tidak bisa dikreditkan")
      if (inv.creditStatus === "credited") throw definitive("Faktur ini sudah dikreditkan — duplikat kredit ditolak")
      if (input.nonCreditableReason) {
        if (!(NON_CREDITABLE_REASONS as readonly string[]).includes(input.nonCreditableReason)) {
          throw definitive(`Alasan non-kreditabel "${input.nonCreditableReason}" tidak dikenal`)
        }
      }
      const check = checkCreditEligibility(inv.taxPeriod, input.creditPeriod)
      if (!check.eligible) {
        if (check.reason === "expired") {
          await tx.taxInvoice.update({ where: { id: inv.id }, data: { creditStatus: "expired" } })
          expiredError = `Masa kredit ${input.creditPeriod} lewat jendela 3 masa dari ${inv.taxPeriod} — faktur expired`
          return
        }
        throw definitive(`Masa kredit ${input.creditPeriod} sebelum masa faktur ${inv.taxPeriod}`)
      }
      const pct = input.creditablePercent ?? 100
      if (!(pct >= 0 && pct <= 100)) throw definitive("Porsi kreditabel harus 0–100")
      const split = creditableSplit(Number(inv.taxAmount), pct)
      void split
      await assertPeriodOpen(new Date(`${input.creditPeriod}-01T00:00:00`), tx as never)
      await tx.taxInvoice.update({
        where: { id: inv.id },
        data: {
          creditPeriod: input.creditPeriod,
          creditedAt: new Date(),
          creditStatus: input.nonCreditableReason ? "not_creditable" : "credited",
          nonCreditableReason: input.nonCreditableReason ?? null,
          creditablePercent: toRate(pct),
        },
      })
      await bindIdempotencyKey(tx as never, input.idempotencyKey, "TaxInvoice", inv.id)
    })
    if (expiredError) return { success: false, error: expiredError, ambiguous: false }
    return { success: true, replayed: isReplay, id: input.id }
  } catch (e) {
    return { success: false, error: getErrorMessage(e), ambiguous: !isDefinitiveError(e) }
  }
}
