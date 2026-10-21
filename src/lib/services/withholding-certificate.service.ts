/**
 * Service WithholdingCertificate — bupot kita-potong & dipotong-pelanggan (F-003).
 *
 * Invarian backend: prisma.$transaction, `assertPeriodOpen` DALAM tx,
 * idempotency key finansial persisten, akun setting/COA fail-closed,
 * Decimal presisi, no silent catch. Jurnal tidak berubah dari pola
 * berjalan: kita potong vendor Dr Hutang / Cr Utang PPh; setor Dr Utang
 * PPh / Cr Kas (TaxPayment wajib taut withholdingTypeId+masa — validasi
 * di sini, kolom taxTypeId sudah ada).
 *
 * Snapshot final: bupot lahir menyalin pasal+kode+tarif+DPP; edit master
 * sesudah itu tak mengubah bupot terbit maupun jurnalnya. Rekap membaca
 * snapshot; baris legacy tanpa dokumen fallback master label `legacy`.
 * Batal = `revoked` + reversal jurnal dokumen sumber, bukan hapus baris.
 */
import { Prisma } from "@prisma/client"
import { prisma, type TxClient } from "@/lib/db/prisma"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { nextSlug } from "@/lib/utils/slug-db"
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
import { slugify } from "@/lib/utils/slug"
import { reverseJournalsByReferenceTx } from "@/lib/hooks/accounting.hook"
import {
  computeWithheld,
  type WithholdingArticle,
  WITHHOLDING_ARTICLES,
} from "@/lib/tax/withholding-certificate"
import { taxPeriodFromDate } from "@/lib/tax/tax-invoice"
import { isValidBillingCode, isValidNtpn } from "@/lib/tax/tax-liability"

const SCOPE_ISSUE: IdemScope = "withholding_issue"
const SCOPE_REVOKE: IdemScope = "withholding_revoke"
const SCOPE_SETTLE: IdemScope = "withholding_settle"

export type WithholdingResult = {
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

function assertArticle(article: string): WithholdingArticle {
  if (!(WITHHOLDING_ARTICLES as readonly string[]).includes(article)) {
    throw definitive(`Pasal "${article}" tidak dikenal (PPh21|PPh22|PPh23|PPh4(2)|PPh26|PPh15)`)
  }
  return article as WithholdingArticle
}

export interface IssueWithholdingInput {
  direction: "we_withhold" | "withheld_from_us"
  certificateNumber: string
  withholdingDate: Date
  counterpartyTaxId?: string | null
  counterpartyName: string
  withholdingTypeId: number
  /** DPP bruto snapshot. */
  dpp: number
  vendorBillId?: number | null
  salesPaymentId?: number | null
  facility?: "SKB" | "PP23" | "DTP" | null
  facilityNumber?: string | null
  idempotencyKey: string
  userId?: number
}

/**
 * Terbitkan bupot: snapshot pasal+kode+tarif+DPP dari jenis terpilih.
 * Akun fail-closed: we_withhold wajib liabilityAccountId; withheld_from_us
 * wajib receivableAccountId (jurnal pola berjalan butuh keduanya).
 */
export async function issueWithholdingCertificate(input: IssueWithholdingInput): Promise<WithholdingResult> {
  try {
    const number = input.certificateNumber.trim()
    if (!number) return { success: false, error: "Nomor bupot DJP wajib diisi" }
    if (!input.counterpartyName.trim()) return { success: false, error: "Nama pihak dipotong wajib diisi" }
    if (!(input.dpp > 0)) return { success: false, error: "DPP bruto harus > 0" }
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      return { success: false, error: "Terbit bupot wajib idempotency key valid" }
    }
    const fp = payloadFingerprint({
      scope: SCOPE_ISSUE,
      direction: input.direction,
      number,
      dpp: Number(input.dpp).toFixed(2),
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
      await assertPeriodOpen(input.withholdingDate, tx as never)
      const dupe = await tx.withholdingCertificate.findFirst({
        where: { certificateNumber: number },
        select: { id: true },
      })
      if (dupe) throw definitive(`Nomor bupot "${number}" sudah terbit`)
      const type = await tx.withholdingTaxType.findUniqueOrThrow({ where: { id: input.withholdingTypeId } })
      const article = assertArticle(type.article ?? "")
      const tariff = Number(type.rate)
      if (!(tariff >= 0)) throw definitive(`Jenis PPh "${type.code}" bertarif tak valid`)
      if (input.direction === "we_withhold" && type.liabilityAccountId == null) {
        throw definitive(`Jenis PPh "${type.code}" belum punya akun Hutang PPh — lengkapi di Pengaturan → Pajak Potong`)
      }
      if (input.direction === "withheld_from_us" && type.receivableAccountId == null) {
        throw definitive(`Jenis PPh "${type.code}" belum punya akun PPh dibayar dimuka — lengkapi di Pengaturan → Pajak Potong`)
      }
      const computed = computeWithheld(input.dpp, tariff)
      const created = await tx.withholdingCertificate.create({
        data: {
          slug: slugify(`bupot-${number}`) || `bupot-${Date.now()}`,
          direction: input.direction,
          certificateNumber: number,
          withholdingDate: input.withholdingDate,
          taxPeriod: taxPeriodFromDate(input.withholdingDate),
          counterpartyTaxId: input.counterpartyTaxId ?? null,
          counterpartyName: input.counterpartyName.trim(),
          withholdingTypeId: type.id,
          article,
          objectCode: type.objectCode,
          dpp: toMoney(computed.dpp),
          tariff: toRate(computed.tariff),
          withheldAmount: toMoney(computed.withheldAmount),
          status: "issued",
          vendorBillId: input.vendorBillId ?? null,
          salesPaymentId: input.salesPaymentId ?? null,
          facility: input.facility ?? null,
          facilityNumber: input.facilityNumber ?? null,
          createdBy: input.userId ?? null,
        },
      })
      await bindIdempotencyKey(tx as never, input.idempotencyKey, "WithholdingCertificate", created.id)
      createdId = created.id
    })
    return { success: true, replayed: isReplay, id: createdId }
  } catch (e) {
    return { success: false, error: getErrorMessage(e), ambiguous: !isDefinitiveError(e) }
  }
}

export interface RevokeWithholdingInput {
  id: number
  idempotencyKey: string
  userId?: number
}

/** Batal = `revoked` + reversal jurnal dokumen sumber, bukan hapus baris. */
export async function revokeWithholdingCertificate(input: RevokeWithholdingInput): Promise<WithholdingResult> {
  try {
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      return { success: false, error: "Revoke bupot wajib idempotency key valid" }
    }
    const fp = payloadFingerprint({ scope: SCOPE_REVOKE, id: input.id })
    let isReplay = false
    await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx as never, SCOPE_REVOKE, input.idempotencyKey, input.userId, fp)
      if (claim.replayed) {
        isReplay = true
        return
      }
      await tx.$queryRaw`SELECT id FROM withholding_certificates WHERE id = ${input.id} FOR UPDATE`
      const cert = await tx.withholdingCertificate.findUniqueOrThrow({ where: { id: input.id } })
      if (cert.status === "revoked") throw definitive("Bupot ini sudah revoked")
      await assertPeriodOpen(cert.withholdingDate, tx as never)
      await tx.withholdingCertificate.update({ where: { id: cert.id }, data: { status: "revoked" } })
      if (cert.vendorBillId != null) {
        await reverseJournalsByReferenceTx(tx as never, "VendorBill", cert.vendorBillId, `revoke bupot ${cert.certificateNumber}`, input.userId ?? null)
      }
      if (cert.salesPaymentId != null) {
        await reverseJournalsByReferenceTx(tx as never, "SalesPayment", cert.salesPaymentId, `revoke bupot ${cert.certificateNumber}`, input.userId ?? null)
      }
      await bindIdempotencyKey(tx as never, input.idempotencyKey, "WithholdingCertificate", cert.id)
    })
    return { success: true, replayed: isReplay, id: input.id }
  } catch (e) {
    return { success: false, error: getErrorMessage(e), ambiguous: !isDefinitiveError(e) }
  }
}

export interface SettleWithholdingInput {
  withholdingTypeId: number
  period: string
  taxAccountId?: number | null
  paymentAccountId: number
  amount: number
  /** Kode billing MPN 15 digit (opsional: setor legacy/manual tanpa billing). */
  billingCode?: string | null
  /** NTPN 16 karakter (opsional: setor legacy/manual tanpa NTPN). */
  ntpn?: string | null
  reference?: string | null
  notes?: string | null
  idempotencyKey: string
  userId?: number
}

/**
 * Setor PPh (TaxPayment wajib taut withholdingTypeId + period — kolom
 * taxTypeId sudah ada; validasi wajib DI SINI, bukan kolom baru).
 * Jurnal tetap Dr akun utang pajak / Cr kas-bank. Nomor dokumen + jurnal
 * di-claim SEBELUM tx via generateDocumentNumber (sequence tak ikut
 * rollback — pola repo: nomor yatim aman, duplikat tidak).
 */
export async function settleWithholdingTax(input: SettleWithholdingInput): Promise<WithholdingResult> {
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) {
      return { success: false, error: "Masa setor harus YYYY-MM" }
    }
    if (!(input.amount > 0)) return { success: false, error: "Jumlah setor harus > 0" }
    if (input.taxAccountId != null && input.taxAccountId === input.paymentAccountId) {
      return { success: false, error: "Akun utang pajak dan kas/bank tidak boleh sama" }
    }
    const billing = input.billingCode?.trim() ? input.billingCode.trim() : null
    const ntpn = input.ntpn?.trim() ? input.ntpn.trim() : null
    if (billing && !isValidBillingCode(billing)) return { success: false, error: "Kode billing harus 15 digit" }
    if (ntpn && !isValidNtpn(ntpn)) return { success: false, error: "NTPN harus 16 karakter" }
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      return { success: false, error: "Setor PPh wajib idempotency key valid" }
    }
    const fp = payloadFingerprint({
      scope: SCOPE_SETTLE,
      settle: input.withholdingTypeId,
      period: input.period,
      amount: Number(input.amount).toFixed(2),
    })
    const date = new Date(`${input.period}-01T00:00:00`)
    let createdId: number | undefined
    let isReplay = false
    const documentNo = await generateDocumentNumber("PAJAK", "simple")
    const journalNo = await generateDocumentNumber("JRN")
    const paymentSlug = await nextSlug("taxPayment", documentNo)
    const journalSlug = await nextSlug("journal", journalNo)
    await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx as never, SCOPE_SETTLE, input.idempotencyKey, input.userId, fp)
      if (claim.replayed) {
        isReplay = true
        createdId = claim.resultRefId ?? undefined
        return
      }
      await assertPeriodOpen(date, tx as never)
      const type = await tx.withholdingTaxType.findUniqueOrThrow({ where: { id: input.withholdingTypeId } })
      // Akun utang fail-closed: input eksplisit else liabilityAccountId jenis.
      const taxAccountId = input.taxAccountId ?? type.liabilityAccountId
      if (taxAccountId == null) {
        throw definitive(`Jenis PPh "${type.code}" belum punya akun Hutang PPh — lengkapi di Pengaturan → Pajak Potong`)
      }
      if (taxAccountId === input.paymentAccountId) {
        throw definitive("Akun utang pajak dan kas/bank tidak boleh sama")
      }
      const accounts = await tx.account.findMany({
        where: { id: { in: [taxAccountId, input.paymentAccountId] } },
        select: { id: true },
      })
      if (accounts.length !== 2) throw definitive("Akun utang pajak / kas-bank tidak ditemukan")
      const payment = await tx.taxPayment.create({
        data: {
          slug: paymentSlug,
          documentNo,
          date,
          period: input.period,
          taxTypeId: input.withholdingTypeId,
          taxAccountId,
          paymentAccountId: input.paymentAccountId,
          amount: toMoney(input.amount),
          billingCode: billing,
          ntpn,
          taxKind: type.article === "PPh23" ? "pph23" : type.article === "PPh4(2)" ? "pph4_2" : type.article === "PPh21" ? "pph21" : "other",
          reference: input.reference ?? null,
          notes: input.notes ?? `Setor ${input.period}`,
          createdBy: input.userId ?? null,
        },
      })
      const journal = await tx.journal.create({
        data: {
          journalNumber: journalNo,
          slug: journalSlug,
          transactionDate: date,
          description: input.notes ?? `Setor PPh masa ${input.period}`,
          type: "TAX_PAYMENT",
          status: "POSTED",
          totalDebit: toMoney(input.amount),
          totalCredit: toMoney(input.amount),
          referenceType: "TaxPayment",
          referenceId: payment.id,
          createdBy: input.userId ?? null,
          entries: {
            create: [
              { accountId: taxAccountId, debit: toMoney(input.amount), credit: toMoney(0), memo: `Setor PPh masa ${input.period}` },
              { accountId: input.paymentAccountId, debit: toMoney(0), credit: toMoney(input.amount), memo: "Kas/bank keluar setor PPh" },
            ],
          },
        },
      })
      await tx.taxPayment.update({ where: { id: payment.id }, data: { journalId: journal.id } })
      await bindIdempotencyKey(tx as never, input.idempotencyKey, "TaxPayment", payment.id)
      createdId = payment.id
    })
    return { success: true, replayed: isReplay, id: createdId }
  } catch (e) {
    return { success: false, error: getErrorMessage(e), ambiguous: !isDefinitiveError(e) }
  }
}

export type { TxClient }
