/**
 * Peristiwa perubahan aset terbekukan — builder MURNI inti gabungan vonis
 * BOT 4 F-2026-10-23-111-V (revaluasi + impairment) dan F-2026-10-23-115-V
 * (reklasifikasi + perubahan metode/estimasi). Tanpa Prisma/DB: service
 * (`asset-change-event.service.ts`) memasok fakta terbekukan (nilai jurnal
 * POSTED, akun terpetakan + tipe, peristiwa lampau aset yang sama), builder
 * memutuskan jurnal + snapshot. Cabut penjaga di sini = tes E111/E115/E128
 * MERAH.
 *
 * Aturan yang dikunci:
 * - F-111 P1: surplus revaluasi ke EQTY (akun surplus terpetakan), DILARANG
 *   laba-rugi/710004/300002 sebagai fallback. Penurunan: tolakan surplus
 *   per-aset dulu (snapshot, tidak negatif, tidak memakan aset lain), sisa
 *   ke beban EXPS. Kenaikan yang membalik beban lampau aset SAMA dibuktikan
 *   dari peristiwa POSTED lampau (`priorLossCharged`), bukan klaim operator.
 * - F-111 P2: fiskal hanya bergerak dengan persetujuan DJP terstruktur
 *   (nomor+tanggal): dasar baru = nilai penilaian kembali, masa manfaat
 *   reset PENUH kelompok, PPh final = tarif master snapshot x selisih lebih
 *   atas nilai sisa buku fiskal semula. Gerbang 5 tahun per aset.
 * - F-111 P3: impairment komersial saja (kontra DEPR terpisah), terpulihkan
 *   terstruktur wajib; pembalikan diplafon nilai-tanpa-impairment; goodwill
 *   tanpa balik. Fiskal diam oleh impairment.
 * - F-128 P3: mapping NULL/nonaktif/tipe salah per peran = tolak berisik
 *   SEBELUM jurnal, pesan menamai peran + kategori. Snapshot id+kode akun
 *   dibekukan per peristiwa; reversal membaca snapshot.
 * - F-115 P1: reklasifikasi pindah bruto+akumulasi+kontra impairment utuh
 *   antar akun kelas, NOL laba-rugi/ekuitas; surplus terikat aset sama ikut.
 * - F-115 P2/P3/P4: ganti metode komersial/fiskal + estimasi = peristiwa
 *   TANPA jurnal (prospektif); fiskal hanya dengan persetujuan DJP;
 *   bangunan fiskal saldo-menurun ditolak mutlak.
 * Uang Decimal(15,2) sen persis; tidak ada float di jalur uang.
 */

import { Prisma } from "@prisma/client"

import {
  fiscalGroupRule,
  isFiscalMethodAllowed,
} from "./asset-fiscal-groups"
import { isRegisteredDepreciationMethod } from "./asset-depreciation"

const ZERO = new Prisma.Decimal(0)

function dec(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}
function sen(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}
function text(value: string | null | undefined): string {
  return (value ?? "").trim()
}

export type AssetChangeEventKind =
  | "REVALUATION_UP"
  | "REVALUATION_DOWN"
  | "IMPAIRMENT"
  | "IMPAIRMENT_REVERSAL"
  | "FISCAL_REVALUATION_APPROVED"
  | "RECLASSIFICATION"
  | "COMMERCIAL_METHOD_CHANGE"
  | "FISCAL_METHOD_CHANGE"
  | "ESTIMATE_CHANGE"

export const ASSET_CHANGE_EVENT_REFERENCE_TYPE = "ASSET_CHANGE_EVENT"

/** Akun terpetakan + fakta DB-nya (dipasok service dari Account). */
export interface MappedAccount {
  id: number
  code: string
  /** Account.type internal: ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE. */
  type: string
  /** Account.reportGroup gaya Accurate: EQTY | EXPS | DEPR | FASS | ... */
  reportGroup: string | null
  isActive: boolean
}

export interface CategoryAccountMapping {
  categoryName: string
  assetAccount: MappedAccount | null
  accumulatedDepreciationAccount: MappedAccount | null
  revaluationSurplusAccount: MappedAccount | null
  impairmentLossAccount: MappedAccount | null
  accumulatedImpairmentAccount: MappedAccount | null
}

/** Fakta jurnal POSTED aset sebelum peristiwa (dari journalBookValue diperluas). */
export interface AssetPostedFacts {
  assetStatus: string
  hasAcquisitionJournal: boolean
  grossCostPosted: Prisma.Decimal | number | string
  accumulatedPosted: Prisma.Decimal | number | string
  accumulatedImpairmentPosted: Prisma.Decimal | number | string
  disposalGrossPosted: Prisma.Decimal | number | string
  /** Surplus revaluasi per-aset dari peristiwa POSTED lampau (snapshot). */
  revaluationSurplusPerAsset: Prisma.Decimal | number | string
  /** Beban penurunan/impairment lampau aset sama yang dibebankan ke laba-rugi. */
  priorLossChargedToProfitOrLoss: Prisma.Decimal | number | string
  /** Tanggal penilaian kembali fiskal terakhir aset ini (gerbang 5 tahun). */
  lastFiscalRevaluationDate: Date | null
}

export interface AssetChangeEventRequest {
  kind: AssetChangeEventKind
  effectiveDate: Date
  sourceDocumentKey: string
  /** Nilai wajar dari laporan penilai (revaluasi). */
  fairValue?: Prisma.Decimal | number | string | null
  appraiserName?: string | null
  appraiserReportRef?: string | null
  revaluedClassName?: string | null
  /** Impairment. */
  impairmentIndicator?: string | null
  recoverableBasis?: string | null
  recoverableAmount?: Prisma.Decimal | number | string | null
  carryingWithoutImpairment?: Prisma.Decimal | number | string | null
  isGoodwillOrNonAmortizing?: boolean
  /** Fiskal berpersetujuan DJP. */
  djpApprovalNumber?: string | null
  djpApprovalDate?: Date | null
  fiscalBaseBefore?: Prisma.Decimal | number | string | null
  /** Tarif PPh final dari master setting (snapshot, bukan konstanta). */
  finalTaxRatePercent?: Prisma.Decimal | number | string | null
  taxPayableAccount?: MappedAccount | null
  fiscalGroupCode?: string | null
  /** Reklasifikasi / perubahan (F-115). */
  toCategoryName?: string | null
  toMapping?: CategoryAccountMapping | null
  reasonCode?: string | null
  approvedByName?: string | null
  oldMethod?: string | null
  newMethod?: string | null
  newUsefulLifeMonths?: number | null
  newResidualValue?: Prisma.Decimal | number | string | null
  isBuildingFiscal?: boolean
}

export interface AssetChangeJournalLine {
  accountId: number
  accountCode: string
  debit: Prisma.Decimal
  credit: Prisma.Decimal
  memo: string
}

export interface BuiltAssetChangeEvent {
  kind: AssetChangeEventKind
  /** Baris jurnal seimbang; kosong = peristiwa tanpa jurnal (F-115 P2/P3/P4). */
  lines: AssetChangeJournalLine[]
  carryingBefore: Prisma.Decimal
  carryingAfter: Prisma.Decimal
  grossBefore: Prisma.Decimal
  accumulatedBefore: Prisma.Decimal
  accumulatedImpairmentBefore: Prisma.Decimal
  revaluationSurplusAfter: Prisma.Decimal
  fiscalBaseBefore: Prisma.Decimal | null
  fiscalBaseAfter: Prisma.Decimal | null
  fiscalSurplusAmount: Prisma.Decimal | null
  finalTaxRatePercent: Prisma.Decimal | null
  finalTaxAmount: Prisma.Decimal | null
  fiscalUsefulLifeMonthsAfter: number | null
}

export type AssetChangeEventBuild =
  | { ok: true; event: BuiltAssetChangeEvent }
  | { ok: false; error: string }

function reject(error: string): AssetChangeEventBuild {
  return { ok: false, error }
}

const IMPAIRMENT_INDICATORS = [
  "PHYSICAL_DAMAGE",
  "OBSOLESCENCE",
  "DISCONTINUED_USE",
  "CHANGED_USE_PLAN",
] as const

const RECLASS_REASONS = [
  "INITIAL_CATEGORY_ERROR",
  "CHANGE_OF_USE",
  "LAND_RIGHT_TO_BUILDING",
  "TO_INVESTMENT_PROPERTY",
  "OTHER_DOCUMENTED",
] as const

const CHANGE_REASONS = [
  "CONSUMPTION_PATTERN_CHANGE",
  "FASTER_WEAR",
  "TECHNOLOGY_OBSOLESCENCE",
  "CAPITAL_IMPROVEMENT_F108",
  "APPRAISAL_REVIEW",
  "OTHER_DOCUMENTED",
] as const

/** Validasi akun per peran (F-128 P3): NULL/nonaktif/tipe salah = tolak bernama. */
function requireRoleAccount(
  account: MappedAccount | null,
  roleLabel: string,
  categoryName: string,
  expected: (a: MappedAccount) => boolean,
  expectedLabel: string,
): string | null {
  if (!account) {
    return `Akun ${roleLabel} belum dipetakan pada kategori ${categoryName} — isi di pengaturan kategori aset`
  }
  if (!account.isActive) {
    return `Akun ${roleLabel} (${account.code}) pada kategori ${categoryName} tidak aktif — aktifkan atau petakan akun lain di pengaturan kategori aset`
  }
  if (!expected(account)) {
    return `Akun ${roleLabel} (${account.code}) pada kategori ${categoryName} bertipe salah — wajib akun ${expectedLabel}`
  }
  return null
}

function isEquityAccount(a: MappedAccount): boolean {
  return a.type === "EQUITY" || a.reportGroup === "EQTY"
}
function isExpenseAccount(a: MappedAccount): boolean {
  return a.type === "EXPENSE" || a.reportGroup === "EXPS"
}
function isContraAssetAccount(a: MappedAccount): boolean {
  return a.reportGroup === "DEPR" || a.reportGroup === "FASS" || (a.type === "ASSET" && a.reportGroup !== null)
}

function line(
  account: MappedAccount,
  debit: Prisma.Decimal,
  credit: Prisma.Decimal,
  memo: string,
): AssetChangeJournalLine | null {
  let d = sen(debit)
  let c = sen(credit)
  // Selisih bruto revaluasi bisa negatif (nilai wajar di antara tercatat dan
  // bruto): normalisasi ke sisi kredit supaya balance tidak runtuh.
  if (d.lt(0)) { c = c.add(d.negated()); d = ZERO }
  if (c.lt(0)) { d = d.add(c.negated()); c = ZERO }
  if (d.lte(0) && c.lte(0)) return null
  return { accountId: account.id, accountCode: account.code, debit: d, credit: c, memo }
}

function pushLine(lines: AssetChangeJournalLine[], l: AssetChangeJournalLine | null) {
  if (l) lines.push(l)
}

function assertBalanced(lines: AssetChangeJournalLine[], kind: string): string | null {
  if (lines.length === 0) return null
  const d = lines.reduce((s, l) => s.add(l.debit), ZERO)
  const c = lines.reduce((s, l) => s.add(l.credit), ZERO)
  return d.equals(c) ? null : `Jurnal peristiwa ${kind} tidak balance: D=${d} K=${c}`
}

function fiveYearsBefore(date: Date): Date {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() - 5)
  return d
}

export function buildAssetChangeEvent(input: {
  request: AssetChangeEventRequest
  facts: AssetPostedFacts
  mapping: CategoryAccountMapping
}): AssetChangeEventBuild {
  const { request, facts, mapping } = input
  const kind = request.kind

  if (facts.assetStatus === "disposed") {
    return reject("Aset sudah dilepas (disposed); peristiwa perubahan aset ditolak.")
  }
  if (!text(request.sourceDocumentKey)) {
    return reject("Dokumen sumber peristiwa wajib diisi (kunci idempotensi).")
  }

  const gross = dec(facts.grossCostPosted)
  const accumulated = dec(facts.accumulatedPosted)
  const accumulatedImpairment = dec(facts.accumulatedImpairmentPosted)
  const disposalGross = dec(facts.disposalGrossPosted)
  const carryingBefore = sen(gross.sub(accumulated).sub(accumulatedImpairment).sub(disposalGross))
  const surplusBefore = Prisma.Decimal.max(ZERO, dec(facts.revaluationSurplusPerAsset))

  const base = {
    kind,
    carryingBefore,
    grossBefore: sen(gross),
    accumulatedBefore: sen(accumulated),
    accumulatedImpairmentBefore: sen(accumulatedImpairment),
    revaluationSurplusAfter: sen(surplusBefore),
    fiscalBaseBefore: null as Prisma.Decimal | null,
    fiscalBaseAfter: null as Prisma.Decimal | null,
    fiscalSurplusAmount: null as Prisma.Decimal | null,
    finalTaxRatePercent: null as Prisma.Decimal | null,
    finalTaxAmount: null as Prisma.Decimal | null,
    fiscalUsefulLifeMonthsAfter: null as number | null,
  }

  // ---- Tanpa jurnal: perubahan metode/estimasi prospektif (F-115 P2/P4) ----
  if (kind === "COMMERCIAL_METHOD_CHANGE" || kind === "ESTIMATE_CHANGE") {
    if (!CHANGE_REASONS.includes((request.reasonCode ?? "") as (typeof CHANGE_REASONS)[number])) {
      return reject("Alasan perubahan wajib dipilih dari daftar terdaftar + penelaah bernama.")
    }
    if (!text(request.approvedByName)) {
      return reject("Penelaah/penyetuju perubahan wajib bernama.")
    }
    if (kind === "COMMERCIAL_METHOD_CHANGE") {
      if (!isRegisteredDepreciationMethod(request.newMethod)) {
        return reject(`Metode komersial baru "${request.newMethod ?? ""}" tidak terdaftar.`)
      }
      if (!text(request.oldMethod) || request.oldMethod === request.newMethod) {
        return reject("Metode lama dan metode baru perubahan metode komersial wajib berbeda.")
      }
    } else {
      const lifeOk = request.newUsefulLifeMonths != null && request.newUsefulLifeMonths > 0
      const residualOk = request.newResidualValue != null
      if (!lifeOk && !residualOk) {
        return reject("Perubahan estimasi wajib membawa masa manfaat baru dan/atau nilai residu baru.")
      }
    }
    // Fiskal diam: peristiwa ini tidak membawa kolom fiskal apa pun.
    return { ok: true, event: { ...base, lines: [], carryingAfter: carryingBefore } }
  }

  if (kind === "FISCAL_METHOD_CHANGE") {
    if (!text(request.djpApprovalNumber) || !request.djpApprovalDate) {
      return reject(
        "Perubahan metode fiskal wajib persetujuan DJP terstruktur (nomor + tanggal). Tanpa itu fiskal berjalan metode lama (taat asas).",
      )
    }
    if (!isRegisteredDepreciationMethod(request.newMethod)) {
      return reject(`Metode fiskal baru "${request.newMethod ?? ""}" tidak terdaftar.`)
    }
    if (request.newMethod === "declining_balance" && request.isBuildingFiscal) {
      return reject("Bangunan fiskal hanya garis lurus; perubahan ke saldo menurun ditolak mutlak.")
    }
    const group = fiscalGroupRule(request.fiscalGroupCode)
    if (group && !isFiscalMethodAllowed(request.newMethod, group)) {
      return reject(`Metode fiskal "${request.newMethod}" tidak sah untuk kelompok ${group.code}.`)
    }
    return { ok: true, event: { ...base, lines: [], carryingAfter: carryingBefore } }
  }

  if (!facts.hasAcquisitionJournal) {
    return reject("Aset belum berjurnal perolehan POSTED; peristiwa berharga ditolak (dasar wajib jurnal POSTED).")
  }

  // ---- Reklasifikasi (F-115 P1): pindah utuh, nol laba-rugi ----
  if (kind === "RECLASSIFICATION") {
    if (!RECLASS_REASONS.includes((request.reasonCode ?? "") as (typeof RECLASS_REASONS)[number])) {
      return reject("Alasan reklasifikasi wajib dipilih dari daftar terdaftar.")
    }
    if (!text(request.approvedByName)) return reject("Penyetuju reklasifikasi wajib bernama.")
    if (!request.toMapping) return reject("Kategori tujuan reklasifikasi wajib dipilih.")
    if (carryingBefore.lte(0) && gross.lte(0)) {
      return reject("Aset bernilai tercatat nol tanpa bruto tidak dapat direklasifikasi.")
    }
    const fromAssetErr = requireRoleAccount(mapping.assetAccount, "Aset Tetap asal", mapping.categoryName, (a) => a.type === "ASSET", "ASSET")
    if (fromAssetErr) return reject(fromAssetErr)
    const to = request.toMapping
    const toAssetErr = requireRoleAccount(to.assetAccount, "Aset Tetap tujuan", to.categoryName, (a) => a.type === "ASSET", "ASSET")
    if (toAssetErr) return reject(toAssetErr)
    const lines: AssetChangeJournalLine[] = []
    const grossMove = sen(gross.sub(disposalGross))
    // Pindah bruto + akumulasi + kontra supaya histori umur terbaca; pasangan
    // per akun hanya bila akun asal != tujuan. Surplus per-aset ikut aset sama
    // (snapshot peristiwa), tidak berpindah ke aset lain dan tidak dijurnal.
    if (mapping.assetAccount!.id !== to.assetAccount!.id && grossMove.gt(0)) {
      pushLine(lines, line(to.assetAccount!, grossMove, ZERO, "Reklasifikasi bruto masuk"))
      pushLine(lines, line(mapping.assetAccount!, ZERO, grossMove, "Reklasifikasi bruto keluar"))
    }
    if (accumulated.gt(0) && mapping.accumulatedDepreciationAccount && to.accumulatedDepreciationAccount
      && mapping.accumulatedDepreciationAccount.id !== to.accumulatedDepreciationAccount.id) {
      pushLine(lines, line(mapping.accumulatedDepreciationAccount, accumulated, ZERO, "Reklasifikasi akumulasi keluar"))
      pushLine(lines, line(to.accumulatedDepreciationAccount, ZERO, accumulated, "Reklasifikasi akumulasi masuk"))
    }
    if (accumulatedImpairment.gt(0)) {
      if (!to.accumulatedImpairmentAccount) {
        return reject(
          `Akun Akumulasi Penurunan Nilai tujuan belum dipetakan pada kategori ${to.categoryName} — isi di pengaturan kategori aset`,
        )
      }
      if (mapping.accumulatedImpairmentAccount && mapping.accumulatedImpairmentAccount.id !== to.accumulatedImpairmentAccount.id) {
        pushLine(lines, line(mapping.accumulatedImpairmentAccount, accumulatedImpairment, ZERO, "Reklasifikasi kontra impairment keluar"))
        pushLine(lines, line(to.accumulatedImpairmentAccount, ZERO, accumulatedImpairment, "Reklasifikasi kontra impairment masuk"))
      }
    }
    const bal = assertBalanced(lines, kind)
    if (bal) return reject(bal)
    return { ok: true, event: { ...base, lines, carryingAfter: carryingBefore } }
  }

  // ---- Revaluasi / impairment (F-111) ----
  if (kind === "REVALUATION_UP" || kind === "REVALUATION_DOWN" || kind === "FISCAL_REVALUATION_APPROVED") {
    if (!text(request.appraiserName) || !text(request.appraiserReportRef)) {
      return reject("Revaluasi wajib penilai bernama + rujukan laporan penilai terstruktur.")
    }
    if (!text(request.revaluedClassName)) {
      return reject("Revaluasi wajib menamai kelas aset yang direvaluasi (per kelas, bukan aset tunggal cherry-pick).")
    }
    if (request.fairValue == null) return reject("Nilai wajar dari laporan penilai wajib diisi sen persis.")
    const fairValue = sen(dec(request.fairValue))
    if (fairValue.lt(0)) return reject("Nilai wajar tidak boleh negatif.")

    if (kind === "FISCAL_REVALUATION_APPROVED") {
      if (!text(request.djpApprovalNumber) || !request.djpApprovalDate) {
        return reject("Revaluasi fiskal wajib nomor + tanggal persetujuan DJP (Pasal 19). Tanpa itu fiskal tidak bergerak.")
      }
      if (facts.lastFiscalRevaluationDate && facts.lastFiscalRevaluationDate > fiveYearsBefore(request.effectiveDate)) {
        return reject("Penilaian kembali fiskal dalam 5 tahun sejak penilaian kembali terakhir ditolak; kasus pengecualian wajib BUTUH-VONIS-AKUNTAN.")
      }
      if (request.fiscalBaseBefore == null) {
        return reject("Nilai sisa buku fiskal semula wajib dibekukan dari baris saldo fiskal terbekukan.")
      }
      if (request.finalTaxRatePercent == null) {
        return reject("Tarif PPh final revaluasi fiskal belum dipetakan di Pengaturan (data master) — peristiwa fiskal ditolak berisik.")
      }
      const taxErr = requireRoleAccount(request.taxPayableAccount ?? null, "Utang PPh Final Revaluasi", "Pengaturan", (a) => a.type === "LIABILITY", "LIABILITY")
      if (taxErr) return reject(taxErr)
      const group = fiscalGroupRule(request.fiscalGroupCode)
      if (!group) return reject("Kelompok fiskal aset wajib terdaftar untuk reset masa manfaat penuh.")
      const fiscalBefore = sen(dec(request.fiscalBaseBefore))
      const fiscalSurplus = sen(Prisma.Decimal.max(ZERO, fairValue.sub(fiscalBefore)))
      const rate = dec(request.finalTaxRatePercent)
      const finalTax = sen(fiscalSurplus.mul(rate).div(100))
      const lines: AssetChangeJournalLine[] = []
      const delta = sen(fairValue.sub(carryingBefore))
      if (delta.gt(0)) {
        const surplusErr = requireRoleAccount(mapping.revaluationSurplusAccount, "Surplus Revaluasi", mapping.categoryName, isEquityAccount, "EQTY (ekuitas)")
        if (surplusErr) return reject(surplusErr)
        const assetErr = requireRoleAccount(mapping.assetAccount, "Aset Tetap", mapping.categoryName, (a) => a.type === "ASSET", "ASSET")
        if (assetErr) return reject(assetErr)
        pushLine(lines, line(mapping.assetAccount!, delta, ZERO, "Revaluasi fiskal berpersetujuan — kenaikan bruto"))
        pushLine(lines, line(mapping.revaluationSurplusAccount!, ZERO, delta, "Revaluasi fiskal berpersetujuan — surplus ekuitas"))
      } else if (delta.lt(0)) {
        return reject("Revaluasi fiskal berpersetujuan dengan nilai di bawah tercatat wajib jalur revaluasi turun komersial terpisah.")
      }
      if (finalTax.gt(0)) {
        const assetErr2 = mapping.assetAccount
          ? null
          : "Akun Aset Tetap belum dipetakan"
        if (assetErr2) return reject(assetErr2)
        // PPh final dibebankan mengurangi surplus ekuitas peristiwa ini.
        pushLine(lines, line(mapping.revaluationSurplusAccount!, finalTax, ZERO, "PPh final 10% revaluasi fiskal — beban surplus"))
        pushLine(lines, line(request.taxPayableAccount!, ZERO, finalTax, "Utang PPh final revaluasi fiskal"))
      }
      const bal = assertBalanced(lines, kind)
      if (bal) return reject(bal)
      return {
        ok: true,
        event: {
          ...base,
          lines,
          carryingAfter: fairValue,
          revaluationSurplusAfter: sen(surplusBefore.add(Prisma.Decimal.max(ZERO, delta)).sub(finalTax.gt(0) ? finalTax : ZERO)),
          fiscalBaseBefore: fiscalBefore,
          fiscalBaseAfter: fairValue,
          fiscalSurplusAmount: fiscalSurplus,
          finalTaxRatePercent: rate,
          finalTaxAmount: finalTax,
          fiscalUsefulLifeMonthsAfter: group.usefulLifeYears * 12,
        },
      }
    }

    const delta = sen(fairValue.sub(carryingBefore))
    if (kind === "REVALUATION_UP") {
      if (delta.lte(0)) return reject("Nilai wajar tidak melebihi nilai tercatat; bukan revaluasi naik.")
      const surplusErr = requireRoleAccount(mapping.revaluationSurplusAccount, "Surplus Revaluasi", mapping.categoryName, isEquityAccount, "EQTY (ekuitas)")
      if (surplusErr) return reject(surplusErr)
      const assetErr = requireRoleAccount(mapping.assetAccount, "Aset Tetap", mapping.categoryName, (a) => a.type === "ASSET", "ASSET")
      if (assetErr) return reject(assetErr)
      const accumErr = requireRoleAccount(mapping.accumulatedDepreciationAccount, "Akumulasi Penyusutan", mapping.categoryName, isContraAssetAccount, "DEPR kontra-aset")
      if (accumErr) return reject(accumErr)
      // Pengecualian laba-rugi hanya porsi membalik beban lampau aset SAMA,
      // dibuktikan peristiwa POSTED lampau (priorLossCharged), ke akun beban asal.
      const reversalToPl = Prisma.Decimal.min(delta, Prisma.Decimal.max(ZERO, dec(facts.priorLossChargedToProfitOrLoss)))
      const toSurplus = sen(delta.sub(reversalToPl))
      const lines: AssetChangeJournalLine[] = []
      if (accumulated.gt(0)) pushLine(lines, line(mapping.accumulatedDepreciationAccount!, accumulated, ZERO, "Revaluasi — tutup akumulasi penyusutan"))
      // Sajikan ulang bruto pada nilai wajar: Dr aset = nilai wajar − bruto
      // berjalan (akumulasi ditutup terpisah di atas), supaya nilai tercatat
      // sesudah = nilai wajar persis dan akumulasi mulai lagi dari nol
      // (PSAK 16: akumulasi diperlakukan sebagai bagian penyesuaian bruto).
      pushLine(lines, line(mapping.assetAccount!, sen(fairValue.sub(gross.sub(disposalGross))), ZERO, "Revaluasi — selisih bruto ke nilai wajar"))
      if (reversalToPl.gt(0)) {
        const lossErr = requireRoleAccount(mapping.impairmentLossAccount, "Beban Penurunan Nilai", mapping.categoryName, isExpenseAccount, "EXPS (beban)")
        if (lossErr) return reject(lossErr)
        pushLine(lines, line(mapping.impairmentLossAccount!, ZERO, reversalToPl, "Revaluasi — balik beban penurunan lampau aset sama"))
      }
      if (toSurplus.gt(0)) pushLine(lines, line(mapping.revaluationSurplusAccount!, ZERO, toSurplus, "Revaluasi — surplus ke ekuitas"))
      const bal = assertBalanced(lines, kind)
      if (bal) return reject(bal)
      return { ok: true, event: { ...base, lines, carryingAfter: fairValue, revaluationSurplusAfter: sen(surplusBefore.add(toSurplus)) } }
    }

    // REVALUATION_DOWN: surplus per-aset dulu, sisa ke beban. Fiskal diam.
    if (delta.gte(0)) return reject("Nilai wajar tidak di bawah nilai tercatat; bukan revaluasi turun.")
    const decrease = sen(delta.negated())
    const chargeSurplus = Prisma.Decimal.min(decrease, surplusBefore)
    const chargePl = sen(decrease.sub(chargeSurplus))
    const assetErr = requireRoleAccount(mapping.assetAccount, "Aset Tetap", mapping.categoryName, (a) => a.type === "ASSET", "ASSET")
    if (assetErr) return reject(assetErr)
    const accumErr = requireRoleAccount(mapping.accumulatedDepreciationAccount, "Akumulasi Penyusutan", mapping.categoryName, isContraAssetAccount, "DEPR kontra-aset")
    if (accumErr) return reject(accumErr)
    const lines: AssetChangeJournalLine[] = []
    if (chargeSurplus.gt(0)) {
      const surplusErr = requireRoleAccount(mapping.revaluationSurplusAccount, "Surplus Revaluasi", mapping.categoryName, isEquityAccount, "EQTY (ekuitas)")
      if (surplusErr) return reject(surplusErr)
      pushLine(lines, line(mapping.revaluationSurplusAccount!, chargeSurplus, ZERO, "Revaluasi turun — tolakan surplus per aset"))
    }
    if (chargePl.gt(0)) {
      const lossErr = requireRoleAccount(mapping.impairmentLossAccount, "Beban Penurunan Nilai", mapping.categoryName, isExpenseAccount, "EXPS (beban)")
      if (lossErr) return reject(lossErr)
      pushLine(lines, line(mapping.impairmentLossAccount!, chargePl, ZERO, "Revaluasi turun — beban penurunan nilai"))
    }
    // Jurnal penurunan model revaluasi: Dr surplus/beban, Cr aset sebesar
    // penurunan atas nilai tercatat (akumulasi tidak ditutup pada penurunan).
    pushLine(lines, line(mapping.assetAccount!, ZERO, decrease, "Revaluasi turun — penurunan nilai tercatat"))
    const bal = assertBalanced(lines, kind)
    if (bal) return reject(bal)
    return { ok: true, event: { ...base, lines, carryingAfter: fairValue, revaluationSurplusAfter: sen(surplusBefore.sub(chargeSurplus)) } }
  }

  if (kind === "IMPAIRMENT" || kind === "IMPAIRMENT_REVERSAL") {
    if (!IMPAIRMENT_INDICATORS.includes((request.impairmentIndicator ?? "") as (typeof IMPAIRMENT_INDICATORS)[number])) {
      return reject("Indikator penurunan nilai wajib dipilih dari daftar terdaftar.")
    }
    if (request.recoverableBasis !== "FAIR_VALUE_LESS_COSTS" && request.recoverableBasis !== "VALUE_IN_USE") {
      return reject("Dasar jumlah terpulihkan wajib terstruktur: nilai wajar kurang biaya pelepasan atau nilai pakai.")
    }
    if (request.recoverableAmount == null) return reject("Jumlah terpulihkan sen persis wajib diisi dari dasar terstruktur.")
    const recoverable = sen(dec(request.recoverableAmount))
    const lossErr = requireRoleAccount(mapping.impairmentLossAccount, "Beban Penurunan Nilai", mapping.categoryName, isExpenseAccount, "EXPS (beban)")
    if (lossErr) return reject(lossErr)
    const contraErr = requireRoleAccount(mapping.accumulatedImpairmentAccount, "Akumulasi Penurunan Nilai", mapping.categoryName, isContraAssetAccount, "DEPR kontra-aset")
    if (contraErr) return reject(contraErr)

    if (kind === "IMPAIRMENT") {
      const impairment = sen(Prisma.Decimal.max(ZERO, carryingBefore.sub(recoverable)))
      if (impairment.lte(0)) return reject("Nilai tercatat tidak melebihi jumlah terpulihkan; tidak ada penurunan nilai.")
      // Aset model revaluasi: tolakan surplus dulu (Putusan 1 via surplus per-aset).
      const lines: AssetChangeJournalLine[] = []
      const chargeSurplus = Prisma.Decimal.min(impairment, surplusBefore)
      const chargePl = sen(impairment.sub(chargeSurplus))
      if (chargeSurplus.gt(0)) {
        const surplusErr = requireRoleAccount(mapping.revaluationSurplusAccount, "Surplus Revaluasi", mapping.categoryName, isEquityAccount, "EQTY (ekuitas)")
        if (surplusErr) return reject(surplusErr)
        pushLine(lines, line(mapping.revaluationSurplusAccount!, chargeSurplus, ZERO, "Penurunan nilai — tolakan surplus per aset"))
      }
      if (chargePl.gt(0)) pushLine(lines, line(mapping.impairmentLossAccount!, chargePl, ZERO, "Penurunan nilai — beban penurunan nilai"))
      pushLine(lines, line(mapping.accumulatedImpairmentAccount!, ZERO, impairment, "Penurunan nilai — akumulasi penurunan nilai"))
      const bal = assertBalanced(lines, kind)
      if (bal) return reject(bal)
      return {
        ok: true,
        event: {
          ...base,
          lines,
          carryingAfter: sen(carryingBefore.sub(impairment)),
          revaluationSurplusAfter: sen(surplusBefore.sub(chargeSurplus)),
        },
      }
    }

    // IMPAIRMENT_REVERSAL
    if (request.isGoodwillOrNonAmortizing) {
      return reject("Pembalikan penurunan nilai goodwill/tak berwujud tanpa amortisasi DILARANG (PSAK 48).")
    }
    if (accumulatedImpairment.lte(0)) return reject("Tidak ada akumulasi penurunan nilai untuk dibalik.")
    if (request.carryingWithoutImpairment == null) {
      return reject("Plafon pembalikan wajib dihitung dari jurnal + jadwal beku (nilai tercatat tanpa penurunan nilai).")
    }
    const ceiling = sen(dec(request.carryingWithoutImpairment))
    const reversalByRecoverable = Prisma.Decimal.max(ZERO, recoverable.sub(carryingBefore))
    const reversalByCeiling = Prisma.Decimal.max(ZERO, ceiling.sub(carryingBefore))
    const reversal = sen(Prisma.Decimal.min(accumulatedImpairment, reversalByRecoverable, reversalByCeiling))
    if (reversal.lte(0)) {
      return reject("Pembalikan melebihi plafon nilai-tanpa-penurunan-nilai atau terpulihkan tidak pulih; ditolak.")
    }
    const lines: AssetChangeJournalLine[] = [
    ]
    pushLine(lines, line(mapping.accumulatedImpairmentAccount!, reversal, ZERO, "Pembalikan penurunan nilai — kurangi kontra"))
    pushLine(lines, line(mapping.impairmentLossAccount!, ZERO, reversal, "Pembalikan penurunan nilai — balik beban"))
    const bal = assertBalanced(lines, kind)
    if (bal) return reject(bal)
    return { ok: true, event: { ...base, lines, carryingAfter: sen(carryingBefore.add(reversal)) } }
  }

  return reject(`Jenis peristiwa "${kind}" tidak dikenal.`)
}
