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
 * Batal = `revoked` + reversal jurnal efek potongan saja
 * (referenceType `WithholdingCertificate`), bukan jurnal dokumen sumber,
 * bukan hapus baris. Jurnal sumber (VendorBill/SalesPayment) tetap POSTED.
 */
import { Prisma } from "@prisma/client"
import { prisma, type TxClient } from "@/lib/db/prisma"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { buildUniqueSlug } from "@/lib/utils/slug"
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
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import {
  computeWithheld,
  resolvePph42RentRateEntry,
  type WithholdingArticle,
  WITHHOLDING_ARTICLES,
} from "@/lib/tax/withholding-certificate"
import { taxPeriodFromDate } from "@/lib/tax/tax-invoice"
import { RECOGNISED_AP_STATUSES } from "@/lib/reports/document-status"
import { isValidBillingCode, isValidNtpn } from "@/lib/tax/tax-liability"

const SCOPE_ISSUE: IdemScope = "withholding_issue"
const SCOPE_REVOKE: IdemScope = "withholding_revoke"
const SCOPE_SETTLE: IdemScope = "withholding_settle"

/**
 * Slug unik di dalam tx: `prisma` global belum melihat baris tak-tercommit,
 * dua terbit berurutan dalam satu tx bisa bertabrakan di kolom @unique.
 * Cek tabrakan lewat delegate tx.
 */
async function nextTxSlug(
  tx: TxClient,
  model: "withholdingCertificate" | "taxPayment" | "journal",
  base: string,
): Promise<string> {
  const d = tx[model] as unknown as {
    findFirst: (args: { where: Record<string, unknown>; select: { id: true } }) => Promise<{ id: number } | null>
  }
  return buildUniqueSlug(base, async (candidate) => (await d.findFirst({ where: { slug: candidate }, select: { id: true } })) !== null)
}

export type WithholdingResult = {
  success: boolean
  error?: string
  ambiguous?: boolean
  replayed?: boolean
  id?: number
}

function isCertificateNumberConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const rec = error as Record<string, unknown>
  if (rec.code !== "P2002") return false
  const meta = rec.meta as Record<string, unknown> | undefined
  const target = meta ? String(meta.target ?? "") : ""
  const message = error instanceof Error ? error.message : ""
  return /uq_withholding_certificates_number|certificate_number/i.test(target)
    || /uq_withholding_certificates_number|certificate_number/i.test(message)
}

function withholdingError(error: unknown, number?: string): WithholdingResult {
  // Terbit konkuren: cek findFirst lolos di kedua tx, yang kalah menabrak
  // unique nomor di create. Tx rollback atomik (klaim idempotency ikut
  // rollback), jadi hasilnya pasti — BUKAN ambigu pola tax-invoice.service.
  if (number && isCertificateNumberConflict(error)) {
    return { success: false, error: `Nomor bupot "${number}" sudah terbit`, ambiguous: false }
  }
  return { success: false, error: getErrorMessage(error), ambiguous: !isDefinitiveError(error) }
}

function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

function toRate(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

/** R8-PAJAK-08: fail-closed untuk jenis PPh nonaktif/soft-deleted. */
function assertWithholdingTypeActive(type: { code: string; isActive?: boolean | null; deletedAt?: Date | null }) {
  if (type.deletedAt != null) throw definitive(`Jenis PPh "${type.code}" sudah dihapus — tidak bisa dipakai`)
  if (type.isActive === false) throw definitive(`Jenis PPh "${type.code}" nonaktif — tidak bisa dipakai`)
}

function assertArticle(article: string): WithholdingArticle {
  if (!(WITHHOLDING_ARTICLES as readonly string[]).includes(article)) {
    throw definitive(`Pasal "${article}" tidak dikenal (PPh21|PPh22|PPh23|PPh4(2)|PPh26|PPh15)`)
  }
  return article as WithholdingArticle
}

/**
 * Penilaian ulang akun jurnal dalam tx: kunci baris terurut
 * `SELECT id FROM accounts ... FOR UPDATE`, lalu akun wajib ada +
 * isActive + deletedAt null, opsional tipe/grup sesuai titik tulis
 * (pola createTaxPayment tax-payment.actions). Baris akun yang tidak
 * terkunci mengembalikan undefined agar nol penolakan palsu.
 */
async function assertJournalAccountsLive(
  tx: TxClient,
  requirements: { id: number; type?: string; reportGroup?: string; label: string }[],
): Promise<void> {
  const ids = [...new Set(requirements.map((r) => r.id))].sort((a, b) => a - b)
  if (ids.length === 0) return
  const raw = tx as { $executeRaw?: unknown }
  if (typeof raw.$executeRaw === "function") {
    await tx.$executeRaw`SELECT id FROM accounts WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`
  }
  const accounts = await tx.account.findMany({
    where: { id: { in: ids } },
    select: { id: true, isActive: true, deletedAt: true, type: true, reportGroup: true },
  })
  if (accounts.length !== ids.length) throw definitive("Akun yang dipilih tidak ditemukan.")
  for (const req of requirements) {
    const account = accounts.find((a) => a.id === req.id)
    if (!account) throw definitive("Akun yang dipilih tidak ditemukan.")
    if (account.deletedAt != null) throw definitive("Akun yang dipilih sudah dihapus.")
    if (!account.isActive) throw definitive("Akun yang dipilih tidak aktif.")
    if (req.type && account.type !== req.type) {
      throw definitive(`${req.label} bukan akun ${req.type} (tipe akun: ${account.type}).`)
    }
    if (req.reportGroup && account.reportGroup !== req.reportGroup) {
      throw definitive(
        req.reportGroup === "BANK"
          ? `${req.label} bukan akun kas/bank (grup laporan BANK).`
          : `${req.label} bukan grup ${req.reportGroup}.`,
      )
    }
  }
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
  /**
   * Bukti dokumen dasar sewa untuk kode objek bersyarat bukti di katalog
   * master (vonis BOT 4 F-051-V F51-3, mis. proyek pemerintah hibah/
   * pinjaman luar negeri). Wajib non-kosong bila kode objek katalog
   * bertanda syarat bukti; untuk kode umum boleh kosong.
   */
  rentObjectEvidence?: string | null
  idempotencyKey: string
  userId?: number
}

/**
 * Terbitkan bupot: snapshot pasal+kode+tarif+DPP dari jenis terpilih.
 * Akun fail-closed: we_withhold wajib liabilityAccountId; withheld_from_us
 * wajib receivableAccountId (jurnal pola berjalan butuh keduanya).
 */
export async function issueWithholdingCertificate(input: IssueWithholdingInput): Promise<WithholdingResult> {
  const number = input.certificateNumber.trim()
  try {
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
      // Satu dokumen sumber = satu bupot aktif: bupot kedua bernomor beda
      // atas bill/payment sama tampil dobel di laporan (potongan terhitung
      // dua kali). Arah wajib cocok dengan dokumen tertaut.
      if (input.vendorBillId != null && input.salesPaymentId != null) {
        throw definitive("Bupot hanya boleh tertaut ke satu dokumen sumber")
      }
      // Bupot tanpa tautan memang legal (register manual, placeholder form
      // "-- Tanpa tautan --"); konsekuensinya dipegang revoke: tanpa kaki
      // potongan di jurnal sumber, revoke tidak memposting jurnal lawan
      // (lihat revokeWithholdingCertificate putaran 22).
      // Putaran 48: bila dokumen tertaut tercatat berpotongan, jenis +
      // nominal bupot wajib sama dengan yang tercatat di sumber — bupot
      // adalah bukti atas potongan yang sudah terjadi di GL, bukan angka
      // bebas; tanpa ini bukti ke DJP beda dari kaki potongan dan revoke
      // melahirkan jurnal lawan sebesar snapshot yang miring.
      let recordedWithholding: { amount: number; typeId: number | null } | null = null
      if (input.vendorBillId != null) {
        if (input.direction !== "we_withhold") {
          throw definitive("Bupot atas tagihan vendor wajib arah we_withhold (kita yang memotong)")
        }
        // Serialisasi per dokumen sumber: idempotency key berbeda tidak
        // saling menahan — kunci baris bill membuat cek bupot aktif di
        // bawah melihat bupot pemenang balapan.
        await tx.$executeRaw`SELECT id FROM vendor_bills WHERE id = ${input.vendorBillId} FOR UPDATE`
        const bill = await tx.vendorBill.findUnique({
          where: { id: input.vendorBillId },
          select: { id: true, status: true, deletedAt: true, withholdingAmount: true, withholdingTypeId: true },
        })
        if (!bill) throw definitive("Tagihan vendor tertaut tidak ditemukan")
        if (bill.deletedAt != null || bill.status === "cancelled") {
          throw definitive("Tagihan vendor tertaut sudah batal/terhapus — bupot tidak bisa diterbitkan")
        }
        // Hanya bill diakui (posted/partial/paid — RECOGNISED_AP_STATUSES)
        // yang boleh melahirkan bupot: draft/approved belum punya jurnal AP
        // maupun kaki potongan dari confirmVendorBill, dan picker form
        // memang hanya menawarkan bill diakui. Tanpa ini bupot draft bisa
        // dikirim langsung ke action dan masuk laporan Bukti Potong
        // sebelum kewajiban diakui.
        if (!(RECOGNISED_AP_STATUSES as readonly string[]).includes(bill.status)) {
          throw definitive("Tagihan vendor tertaut belum terposting — bupot hanya untuk tagihan posted/partial/paid")
        }
        const activeDupe = await tx.withholdingCertificate.findFirst({
          where: { vendorBillId: input.vendorBillId, status: { not: "revoked" } },
          select: { id: true, certificateNumber: true },
        })
        if (activeDupe) {
          throw definitive(`Tagihan ini sudah punya bupot aktif "${activeDupe.certificateNumber}" — cabut dulu sebelum terbit baru`)
        }
        recordedWithholding = { amount: Number(bill.withholdingAmount ?? 0), typeId: bill.withholdingTypeId ?? null }
      }
      if (input.salesPaymentId != null) {
        if (input.direction !== "withheld_from_us") {
          throw definitive("Bupot atas pembayaran pelanggan wajib arah withheld_from_us (kita yang dipotong)")
        }
        await tx.$executeRaw`SELECT id FROM sales_payments WHERE id = ${input.salesPaymentId} FOR UPDATE`
        const payment = await tx.salesPayment.findUnique({
          where: { id: input.salesPaymentId },
          select: { id: true, status: true, withholdingAmount: true, withholdingTypeId: true },
        })
        if (!payment) throw definitive("Pembayaran pelanggan tertaut tidak ditemukan")
        if (payment.status === "reversed") {
          throw definitive("Pembayaran tertaut sudah dibalik — bupot tidak bisa diterbitkan")
        }
        const activeDupe = await tx.withholdingCertificate.findFirst({
          where: { salesPaymentId: input.salesPaymentId, status: { not: "revoked" } },
          select: { id: true, certificateNumber: true },
        })
        if (activeDupe) {
          throw definitive(`Pembayaran ini sudah punya bupot aktif "${activeDupe.certificateNumber}" — cabut dulu sebelum terbit baru`)
        }
        recordedWithholding = { amount: Number(payment.withholdingAmount ?? 0), typeId: payment.withholdingTypeId ?? null }
      }
      // R8-PAJAK-08: jenis nonaktif/terhapus tidak boleh melahirkan bupot.
      const type = await tx.withholdingTaxType.findUniqueOrThrow({ where: { id: input.withholdingTypeId } })
      assertWithholdingTypeActive(type)
      const article = assertArticle(type.article ?? "")
      // F51-1/2/3/5/6 (vonis BOT 4 F-2026-10-22-051-V): bupot sewa
      // fail-closed terhadap KATALOG master. Katalog dibaca di sini dari
      // baris master aktif keluarga sewa (code "PPH42-SEWA" dan turunannya,
      // mis. "PPH42-SEWA-PP") — resolver tidak meng-hardcode daftar kode.
      // Jenis sewa non-default di katalog = kode bersyarat bukti dokumen.
      // Jenis lain tak disentuh resolver sewa. Master tanpa tanggal
      // efektif/histori: nilai berjalan divalidasi lalu dibekukan snapshot.
      const isRentType = type.code.startsWith("PPH42-SEWA")
      const rentResolution = isRentType
        ? await (async () => {
            const rows = await tx.withholdingTaxType.findMany({
              where: { code: { startsWith: "PPH42-SEWA" }, isActive: true, deletedAt: null },
              select: { code: true, objectCode: true, rate: true },
            })
            const catalog = rows.flatMap((r) =>
              r.objectCode ? [{ objectCode: r.objectCode, rate: Number(r.rate), requiresEvidence: r.code !== "PPH42-SEWA" }] : [],
            )
            try {
              const resolved = resolvePph42RentRateEntry(type.objectCode, catalog, input.withholdingDate, {
                evidence: input.rentObjectEvidence,
              })
              return {
                rate: resolved.rate,
                objectName: resolved.objectName,
                rentObjectEvidence:
                  resolved.evidence != null ? (input.rentObjectEvidence ?? "").trim() || null : null,
              }
            } catch (e) {
              throw definitive(getErrorMessage(e))
            }
          })()
        : null
      const tariff = rentResolution ? rentResolution.rate : Number(type.rate)
      if (!(tariff >= 0)) throw definitive(`Jenis PPh "${type.code}" bertarif tak valid`)
      if (input.direction === "we_withhold" && type.liabilityAccountId == null) {
        throw definitive(`Jenis PPh "${type.code}" belum punya akun Hutang PPh — lengkapi di Pengaturan → Pajak Potong`)
      }
      if (input.direction === "withheld_from_us" && type.receivableAccountId == null) {
        throw definitive(`Jenis PPh "${type.code}" belum punya akun PPh dibayar dimuka — lengkapi di Pengaturan → Pajak Potong`)
      }
      // R8-PAJAK-03: fasilitas menurunkan potongan di sisi service (kontrak
      // `computeWithheld` di tax/withholding-certificate.ts). SKB = dibebaskan,
      // PP23 = final dibayar sendiri penerima penghasilan, DTP = ditanggung
      // pemerintah — ketiganya berarti lawan TIDAK dipotong, jadi jumlah
      // potong 0. Tarif snapshot tetap nominal master (ekspor membedakan
      // lewat facility + facilityNumber; falsifikasi E114-7: SKB sah nol).
      const facility = input.facility ?? null
      if (facility !== null && !["SKB", "PP23", "DTP"].includes(facility)) {
        throw definitive(`Fasilitas "${facility}" tidak dikenal (SKB|PP23|DTP)`)
      }
      const computed = computeWithheld(input.dpp, tariff)
      // Putaran 48 (lanjutan): pencocokan nominal+jenis terhadap potongan
      // tercatat sumber. Fasilitas (SKB/PP23/DTP — potong 0 sah) dan sumber
      // tanpa potongan tercatat (kaki potongan belum lahir) dikecualikan,
      // sama seperti cabang revoke register-saja putaran 22.
      if (recordedWithholding != null && recordedWithholding.amount > 0 && !facility) {
        const certAmount = computed.withheldAmount
        const amountMatches = Math.abs(certAmount - recordedWithholding.amount) < 0.005
        if (!amountMatches || recordedWithholding.typeId !== type.id) {
          throw definitive(
            "Nominal/jenis potongan bupot tidak cocok dengan potongan tercatat pada dokumen sumber — bupot membuktikan potongan yang tercatat, bukan angka baru.",
          )
        }
      }
      const created = await tx.withholdingCertificate.create({
        data: {
          slug: await nextTxSlug(tx as never, "withholdingCertificate", `bupot-${number}`),
          direction: input.direction,
          certificateNumber: number,
          withholdingDate: input.withholdingDate,
          taxPeriod: taxPeriodFromDate(input.withholdingDate),
          counterpartyTaxId: input.counterpartyTaxId ?? null,
          counterpartyName: input.counterpartyName.trim(),
          withholdingTypeId: type.id,
          article,
          objectCode: type.objectCode,
          objectName: rentResolution?.objectName ?? null,
          rentObjectEvidence: rentResolution?.rentObjectEvidence ?? null,
          dpp: toMoney(computed.dpp),
          tariff: toRate(tariff),
          withheldAmount: toMoney(facility ? 0 : computed.withheldAmount),
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
    return withholdingError(e, number)
  }
}

export interface RevokeWithholdingInput {
  id: number
  idempotencyKey: string
  userId?: number
}

/**
 * Batal = `revoked` + reversal jurnal efek potongan saja, bukan hapus baris.
 * Jurnal VendorBill/SalesPayment sumber memuat efek potongan sebagai satu
 * kaki di dalam jurnal gabungan (Cr Hutang PPh / Dr PPh dibayar dimuka);
 * me-reverse seluruh jurnal sumber menghapus beban/piutang dokumen yang
 * tetap sah. Karena itu revoke membuat jurnal lawan khusus bupot:
 * referenceType `WithholdingCertificate`, referenceId = id bupot, sebesar
 * `withheldAmount` snapshot — Dr Hutang PPh / Cr Hutang Usaha (we_withhold)
 * atau Dr Piutang / Cr PPh dibayar dimuka (withheld_from_us). Unik aktif
 * per (referenceType, referenceId) + status `revoked` + idempotency key
 * membuat revoke ganda mustahil dobel-jurnal.
 */
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
      // Putaran 22: jurnal lawan hanya sah bila efek potongan benar-benar
      // lahir di jurnal sumber. Bupot tanpa tautan (register manual legal)
      // dan bupot atas dokumen tanpa potongan tercatat tidak pernah
      // menaikkan akun Hutang PPh/PPh dimuka — memposting lawan akan
      // mengurangi saldo pajak tanpa dasar. Kasus itu revoke cukup
      // membatalkan register (status revoked, tanpa jurnal).
      let sourceHasWithholdingLeg = false
      let sourceWithholdingAmount: number | null = null
      if (cert.direction === "we_withhold" && cert.vendorBillId != null) {
        const bill = await tx.vendorBill.findUnique({
          where: { id: cert.vendorBillId },
          select: { withholdingAmount: true, withholdingTypeId: true },
        })
        sourceHasWithholdingLeg = !!bill
          && Number(bill.withholdingAmount ?? 0) > 0
          && bill.withholdingTypeId === cert.withholdingTypeId
        if (bill) sourceWithholdingAmount = Number(bill.withholdingAmount ?? 0)
      } else if (cert.direction === "withheld_from_us" && cert.salesPaymentId != null) {
        const payment = await tx.salesPayment.findUnique({
          where: { id: cert.salesPaymentId },
          select: { withholdingAmount: true, withholdingTypeId: true },
        })
        sourceHasWithholdingLeg = !!payment
          && Number(payment.withholdingAmount ?? 0) > 0
          && payment.withholdingTypeId === cert.withholdingTypeId
        if (payment) sourceWithholdingAmount = Number(payment.withholdingAmount ?? 0)
      }
      await assertPeriodOpen(cert.withholdingDate, tx as never)
      const amount = Number(cert.withheldAmount)
      // Bupot fasilitas (SKB/PP23/DTP) dan jenis bertarif 0 sah berpotongan
      // nol (R8-PAJAK-03): tanpa kaki sumber, revoke-nya register-saja di
      // cabang bawah dan nominal nol bukan halangan. Yang ditolak hanya
      // nominal nol PADAHAL sumber tercatat berpotongan — itu mismatch
      // nominal bupot vs sumber, jurnal lawan nol tak boleh lahir.
      if (sourceHasWithholdingLeg && !(amount > 0)) {
        throw definitive("Nominal potongan bupot tidak cocok dengan dokumen sumber untuk revoke")
      }
      // Putaran 48: jurnal lawan memakai snapshot bupot, jadi nominalnya
      // wajib sama dengan potongan tercatat sumber. Bupot warisan yang
      // lahir sebelum pencocokan di titik terbit bisa menyimpang — revoke
      // dengan jurnal lawan sebesar snapshot akan menggerakkan Hutang
      // PPh/PPh dimuka dengan angka yang tak pernah masuk dari sumber.
      if (
        sourceHasWithholdingLeg
        && sourceWithholdingAmount != null
        && Math.abs(amount - sourceWithholdingAmount) >= 0.005
      ) {
        throw definitive("Nominal potongan bupot tidak cocok dengan potongan tercatat pada dokumen sumber untuk revoke")
      }
      // Akun efek potongan dari master jenis (fail-closed, pola terbit):
      // we_withhold memakai liabilityAccountId; withheld_from_us memakai
      // receivableAccountId. Akun lawan: Hutang Usaha (tagihan vendor) atau
      // Piutang Usaha (pembayaran penjualan) dari system setting.
      const type = await tx.withholdingTaxType.findUniqueOrThrow({ where: { id: cert.withholdingTypeId } })
      const isWeWithhold = cert.direction === "we_withhold"
      if (!isWeWithhold && cert.direction !== "withheld_from_us") {
        throw definitive(`Arah bupot "${cert.direction}" tidak dikenal untuk revoke`)
      }
      const withholdingAccountId = isWeWithhold ? type.liabilityAccountId : type.receivableAccountId
      if (withholdingAccountId == null) {
        throw definitive(
          isWeWithhold
            ? `Jenis PPh "${type.code}" belum punya akun Hutang PPh — lengkapi di Pengaturan → Pajak Potong`
            : `Jenis PPh "${type.code}" belum punya akun PPh dibayar dimuka — lengkapi di Pengaturan → Pajak Potong`,
        )
      }
      const settings = await tx.systemSetting.findFirst()
      if (!settings) throw definitive("Pengaturan sistem belum dikonfigurasi")
      const counterAccountId = isWeWithhold
        ? (settings as { purchasePayableAccountId?: number | null }).purchasePayableAccountId
        : (settings as { salesReceivableAccountId?: number | null }).salesReceivableAccountId
      if (counterAccountId == null) {
        throw definitive(
          isWeWithhold
            ? "Akun Hutang Usaha belum dikonfigurasi untuk revoke bupot"
            : "Akun Piutang Usaha belum dikonfigurasi untuk revoke bupot",
        )
      }
      // Kaki sumber asli ada, jadi jurnal lawan benar-benar lahir — nilai
      // ulang dua akun tujuannya hidup di titik tulis (pola posting).
      if (sourceHasWithholdingLeg) {
        await assertJournalAccountsLive(tx as never, [
          { id: withholdingAccountId, label: "Akun pajak bupot" },
          { id: counterAccountId, label: "Akun lawan bupot" },
        ])
      }
      await tx.withholdingCertificate.update({ where: { id: cert.id }, data: { status: "revoked" } })
      if (!sourceHasWithholdingLeg) {
        // Tanpa kaki sumber tak ada yang dibalik; nomor jurnal/jurnal lawan
        // dilewati agar saldo pajak tidak berubah tanpa dasar.
        await bindIdempotencyKey(tx as never, input.idempotencyKey, "WithholdingCertificate", cert.id)
        return
      }
      // Hanya efek potongan yang dibalik; jurnal dokumen sumber utuh.
      const journalNo = await generateDocumentNumber("JRN")
      const journalSlug = await nextTxSlug(tx as never, "journal", journalNo)
      await tx.journal.create({
        data: {
          journalNumber: journalNo,
          slug: journalSlug,
          transactionDate: cert.withholdingDate,
          description: `Revoke bupot ${cert.certificateNumber}: balik efek potongan saja`,
          type: "AUTO",
          status: "POSTED",
          totalDebit: toMoney(amount),
          totalCredit: toMoney(amount),
          referenceType: "WithholdingCertificate",
          referenceId: cert.id,
          createdBy: input.userId ?? null,
          entries: {
            create: isWeWithhold
              ? [
                  { accountId: withholdingAccountId, debit: toMoney(amount), credit: toMoney(0), memo: `Balik potongan bupot ${cert.certificateNumber} (Dr Hutang PPh)` },
                  { accountId: counterAccountId, debit: toMoney(0), credit: toMoney(amount), memo: `Balik potongan bupot ${cert.certificateNumber} (Cr Hutang Usaha)` },
                ]
              : [
                  { accountId: counterAccountId, debit: toMoney(amount), credit: toMoney(0), memo: `Balik potongan bupot ${cert.certificateNumber} (Dr Piutang)` },
                  { accountId: withholdingAccountId, debit: toMoney(0), credit: toMoney(amount), memo: `Balik potongan bupot ${cert.certificateNumber} (Cr PPh dibayar dimuka)` },
                ],
          },
        },
      })
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
    // Tanggal dokumen repo = tengah malam UTC hari kalender. Konstruktor
    // string lokal membuat setor tanggal 1 jatuh di bulan sebelumnya dalam
    // komponen UTC, jadi jurnal muncul di laporan GL bulan yang salah.
    const date = wibDateToUtcMidnight(`${input.period}-01`)
    let createdId: number | undefined
    let isReplay = false
    // R8-PAJAK-02: nomor dari generateDocumentNumber atomic (tak ikut
    // rollback — nomor yatim aman, duplikat tidak); slug dicek di dalam tx
    // lewat tx delegate. Cek prisma global lama tidak melihat baris
    // tak-tercommit milik transaksi lain → slug sama → P2002 ambiguous.
    const documentNo = await generateDocumentNumber("PAJAK", "simple")
    const journalNo = await generateDocumentNumber("JRN")
    await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx as never, SCOPE_SETTLE, input.idempotencyKey, input.userId, fp)
      if (claim.replayed) {
        isReplay = true
        createdId = claim.resultRefId ?? undefined
        return
      }
      await assertPeriodOpen(date, tx as never)
      // Putaran 22: kunci baris jenis SEBELUM baca (pola tax-payment.actions):
      // bacaan plain dalam REPEATABLE READ membaca snapshot lama — jenis yang
      // dinonaktifkan sesudah tx mulai tetap lolos. Kunci adalah locking read
      // yang melihat baris terbaru dan menserialkan lawan penulis jenis.
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM withholding_tax_types WHERE id = ${input.withholdingTypeId} FOR UPDATE`
      }
      // R8-PAJAK-08: setor untuk jenis nonaktif/terhapus juga ditolak.
      const type = await tx.withholdingTaxType.findUniqueOrThrow({ where: { id: input.withholdingTypeId } })
      assertWithholdingTypeActive(type)
      // Akun utang fail-closed: input eksplisit else liabilityAccountId jenis.
      const taxAccountId = input.taxAccountId ?? type.liabilityAccountId
      if (taxAccountId == null) {
        throw definitive(`Jenis PPh "${type.code}" belum punya akun Hutang PPh — lengkapi di Pengaturan → Pajak Potong`)
      }
      if (taxAccountId === input.paymentAccountId) {
        throw definitive("Akun utang pajak dan kas/bank tidak boleh sama")
      }
      // Gerbang titik setor (pola createTaxPayment): akun wajib hidup +
      // grup dinilai ulang dalam tx berkunci — akun yang mati/dihapus
      // sesudah picker dimuat tidak menerima jurnal POSTED.
      await assertJournalAccountsLive(tx as never, [
        { id: taxAccountId, type: "LIABILITY", label: "Akun utang pajak" },
        { id: input.paymentAccountId, reportGroup: "BANK", label: "Akun pembayaran setor pajak" },
      ])
      const paymentSlug = await nextTxSlug(tx as never, "taxPayment", documentNo)
      const journalSlug = await nextTxSlug(tx as never, "journal", journalNo)
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
