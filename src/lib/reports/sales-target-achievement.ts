/**
 * Builder murni target vs pencapaian penjualan (F-2026-10-22-088-S tahap 1
 * + F-2026-10-24-131-V tahap 2, basis NETO Q-TGT-1).
 *
 * Komponen bruto MEMAKAI basis yang IDENTIK dengan rekap komisi
 * F-2026-10-21-016 tahap 2: faktur status `paid`, `deletedAt:null`,
 * `date` dalam jendela, dikelompokkan per snapshot `salesEmployeeId`;
 * tanpa penjual masuk ember `unattributed` (BR-TGT-01/02). Rekap komisi
 * TIDAK berubah oleh tahap 2 — kunci AC-TGT-10 lama ("pencapaian ==
 * paidBase") diganti kunci rekonsiliasi F-131-V Putusan 5:
 * grossPaidAmount == paidBase komisi, dan achievedAmount ==
 * grossPaidAmount − returnDeductionAmount.
 *
 * Aturan mengikat:
 * - Pencapaian (achievedAmount) = grossPaidAmount − returnDeductionAmount
 *   per penjual per periode; persen/gap dari angka NETO itu (dapat
 *   negatif, tidak di-floor).
 * - Pengurang SAH (Putusan 2): retur status completed, tertaut faktur
 *   paid, sebesar returnDpp+returnVat snapshot beku. Baris legacy tanpa
 *   snapshot diturunkan dari qty × price beku baris retur + PPN proporsional
 *   tarif efektif faktur asal (label legacy di read-model) — bukan cost,
 *   bukan harga master berjalan.
 * - Plafon per faktur (Putusan 2 butir 5): Σ pengurang per faktur asal
 *   ≤ grandTotal faktur asal; selisih ter-clamp tampil sebagai temuan
 *   bernama `invoiceDeductionClampFindings`, tidak dipotong diam-diam.
 * - Retur beda periode (Putusan 3): pengurang dibukukan pada periode
 *   TANGGAL RETUR (SalesReturn.date) ke penjual snapshot faktur asal;
 *   periode asal tidak ditulis ulang. Retur tanpa salesInvoiceId tidak
 *   mengurangi penjual mana pun (tidak ada atribusi sah).
 * - Loader menjamin hanya retur completed tertaut faktur paid yang
 *   diteruskan ke builder (filter massal); builder tetap membaca nilai
 *   per baris apa adanya (snapshot vs legacy dari null-nya).
 * - Persen HANYA untuk periode target yang termuat PENUH dalam rentang
 *   laporan; periode bersinggungan sebagian tampil dengan lencana
 *   tidak-utuh dan persen null — prorata DILARANG (BR-TGT-05).
 * - Penjual berfaktur/beretur tanpa target tampil "tanpa target",
 *   persen null (bukan 0%) (BR-TGT-04).
 * - Persen perusahaan = Σ achieved ÷ Σ target baris yang dinilai utuh
 *   (tertimbang nilai, BR-TGT-11), bukan rata-rata persen.
 * - Pencapaian per baris target dihitung dari faktur/retur dalam PERIODE
 *   TARGET itu sendiri (bukan rentang laporan, kecuali ember rentang).
 * - Label §6 verbatim F-131-V diekspor di sini dan selalu terisi
 *   (`notice`, `modifiedBadgePrefix`); UI menempel apa adanya
 *   (BR-TGT-07). Laporan analitis: NOL jurnal, NOL kewajiban (Putusan 4).
 * Pure (tanpa Prisma/DOM).
 */

import { formatNumber } from "@/lib/utils/format"
import { safeAdd, safeRound, safeSubtract } from "@/lib/utils/math"
import { isLegacyReturnLine, snapshotReturnLine } from "@/lib/tax/return-snapshot"

/** Label informatif §6 verbatim F-131-V Putusan 5 — UI wajib menempel apa adanya. */
export const SALES_TARGET_NOTICE =
  "Laporan informatif dari snapshot penjual di faktur lunas — bukan dasar bonus, jurnal, atau pembayaran. Retur penjualan selesai (completed) mengurangi pencapaian pada periode tanggal retur."

export const SALES_TARGET_UNATTRIBUTED_LABEL = "Tanpa penjual (dokumen lama)"
export const SALES_TARGET_NO_TARGET_LABEL = "Tanpa target"
export const SALES_TARGET_PARTIAL_PERIOD_LABEL =
  "Periode target tidak utuh — persen tidak dihitung"
/** Awalan lencana target diubah; tanggal dd/mm/yyyy ditambah pemanggil. */
export const SALES_TARGET_MODIFIED_BADGE_PREFIX = "Target diubah"
/** Label wajib baris legacy tanpa snapshot (Putusan 2 butir 4 F-131-V). */
export const SALES_TARGET_LEGACY_LABEL = "legacy" as const

export interface SalesTargetInput {
  id: number
  salesEmployeeId: number
  salesEmployeeName: string
  periodStart: Date
  periodEnd: Date
  targetAmount: number
  notes: string | null
  /** Waktu perubahan terakhir SESUDAH periode mulai (BR-TGT-09); null = belum pernah diubah sesudah mulai. */
  modifiedAfterPeriodStartAt: Date | null
}

export interface SalesTargetPaidInvoiceInput {
  /** Id faktur paid (plaafon pengurang per faktur asal). Loader selalu mengisi; fixture lama tanpa id tidak pernah jadi asal retur. */
  id?: number
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  /** Tanggal faktur paid (basis jendela sama dengan loader komisi). */
  date: Date
  grandTotal: number
  /** DPP faktur asal = subtotal − discount; dipakai hanya tarif legacy. Opsional utk fixture lama. */
  subtotal?: number
  discount?: number
  taxAmount?: number
}

/** Satu baris retur completed tertaut faktur paid (loader sudah memfilter). */
export interface SalesTargetReturnLineInput {
  qty: number
  /** Harga jual beku baris retur; DILARANG cost (F-004). */
  price: number
  returnDpp: number | null
  returnVat: number | null
}

export interface SalesTargetReturnInput {
  id: number
  /** Tanggal dokumen retur — periode pengurang (Putusan 3). */
  date: Date
  salesInvoiceId: number
  lines: readonly SalesTargetReturnLineInput[]
}

export interface SalesTargetRange {
  start: Date
  end: Date
}

export interface SalesTargetAchievementRow {
  targetId: number | null
  salesEmployeeId: number
  salesEmployeeName: string
  periodStart: Date | null
  periodEnd: Date | null
  targetAmount: number | null
  notes: string | null
  /** Σ grandTotal faktur paid periode ini (komponen bruto, Putusan 5). */
  grossPaidAmount: number
  /** Σ pengurang retur completed periode ini, sesudah plafon per faktur. */
  returnDeductionAmount: number
  /** Neto: grossPaidAmount − returnDeductionAmount (dapat negatif). */
  achievedAmount: number
  /** Null bila periode tidak utuh dalam rentang atau tanpa target (BR-TGT-05/04). */
  achievementPercent: number | null
  /** Null bila persen tidak dihitung; selain itu achieved − target (boleh negatif). */
  gapAmount: number | null
  invoiceCount: number
  /** Retur completed yang mengurangi baris ini (per tanggal retur). */
  returnCount: number
  /** True bila sebagian pengurang baris ini dari baris retur legacy (Putusan 2.4). */
  hasLegacyReturnLines: boolean
  /** Σ pengurang dari baris legacy saja (sesudah plafon), berlabel `legacy`. */
  legacyReturnDeductionAmount: number
  periodFullyContained: boolean
  hasTarget: boolean
  modifiedAfterPeriodStartAt: Date | null
}

/** Temuan plafon: pengurang satu faktur asal ditahan pada grandTotal-nya. */
export interface SalesTargetDeductionClampFinding {
  salesInvoiceId: number
  salesEmployeeId: number | null
  grandTotal: number
  rawDeductionAmount: number
  clampedDeductionAmount: number
}

/** Satu retur yang memuat baris legacy — berlabel `legacy` (Putusan 2.4). */
export interface SalesTargetLegacyReturn {
  returnId: number
  salesInvoiceId: number
  salesEmployeeId: number | null
  label: typeof SALES_TARGET_LEGACY_LABEL
  /** Pengurang dari baris legacy retur ini saja (sesudah plafon per faktur). */
  deductionAmount: number
}

export interface SalesTargetAchievement {
  rows: SalesTargetAchievementRow[]
  /** Baris penjual berfaktur paid / beretur dalam rentang tanpa target dinilai. */
  noTargetRows: SalesTargetAchievementRow[]
  unattributed: {
    label: string
    invoiceCount: number
    grossPaidAmount: number
    returnDeductionAmount: number
    achievedAmount: number
    hasLegacyReturnLines: boolean
    legacyReturnDeductionAmount: number
  }
  /** Σ komponen bruto baris target dinilai utuh + unattributed dalam rentang. */
  totalGrossPaidAmount: number
  /** Σ pengurang baris target dinilai utuh + unattributed (rentang). */
  totalReturnDeductionAmount: number
  /** Σ achieved baris target dinilai utuh (di periode targetnya) + unattributed dalam rentang. */
  totalAchievedAmount: number
  /** Σ target baris yang dinilai utuh (persen perusahaan tertimbang, BR-TGT-11). */
  totalTargetAmount: number
  /** Pencapaian baris dinilai utuh saja (tanpa unattributed) untuk persen perusahaan. */
  totalAchievedForPercent: number
  companyPercent: number | null
  /** Pengurang mentah per faktur melampaui grandTotal faktur asal (Putusan 2.5). */
  invoiceDeductionClampFindings: SalesTargetDeductionClampFinding[]
  /** Retur berbaris legacy, masing-masing berlabel `legacy` (Putusan 2.4). */
  legacyReturns: SalesTargetLegacyReturn[]
  notice: string
}

function inRange(d: Date, start: Date, end: Date): boolean {
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime()
}

/** Inklusif akhir hari (pola invoiceEnd loader komisi). */
function inDayRange(d: Date, start: Date, end: Date): boolean {
  return inRange(d, start, new Date(end.getTime() + 24 * 3_600_000 - 1))
}

function percent(achieved: number, target: number): number {
  return target > 0 ? Math.round((achieved / target) * 100 * 100) / 100 : 0
}

/** Nilai komersial satu retur: Σ baris (returnDpp+returnVat) snapshot; legacy diturunkan. */
function returnLineValues(
  ret: SalesTargetReturnInput,
  invoice: SalesTargetPaidInvoiceInput | undefined,
): { total: number; legacy: number } {
  if (!invoice) return { total: 0, legacy: 0 }
  let total = 0
  let legacy = 0
  for (const line of ret.lines) {
    if (!isLegacyReturnLine(line)) {
      total = safeAdd(total, safeRound(safeAdd(line.returnDpp!, line.returnVat!, 2), 2), 2)
      continue
    }
    const snap = snapshotReturnLine({
      qty: line.qty,
      price: line.price,
      source: {
        subtotal: invoice.subtotal ?? 0,
        discount: invoice.discount ?? 0,
        taxAmount: invoice.taxAmount ?? 0,
      },
    })
    const value = safeRound(safeAdd(snap.returnDpp, snap.returnVat, 2), 2)
    total = safeAdd(total, value, 2)
    legacy = safeAdd(legacy, value, 2)
  }
  return { total, legacy }
}

function returnCommercialValue(
  ret: SalesTargetReturnInput,
  invoice: SalesTargetPaidInvoiceInput | undefined,
): number {
  return returnLineValues(ret, invoice).total
}

function invoiceMap(
  invoices: readonly SalesTargetPaidInvoiceInput[],
): Map<number, SalesTargetPaidInvoiceInput> {
  const map = new Map<number, SalesTargetPaidInvoiceInput>()
  for (const inv of invoices) {
    if (inv.id !== undefined) map.set(inv.id, inv)
  }
  return map
}

export function buildSalesTargetAchievement(args: {
  targets: readonly SalesTargetInput[]
  /** Faktur paid rentang LUASAN: cakupan gabungan periode target + rentang laporan. */
  invoices: readonly SalesTargetPaidInvoiceInput[]
  /** Retur completed tertaut faktur paid dalam invoices (loader memfilter). */
  returns?: readonly SalesTargetReturnInput[]
  range: SalesTargetRange
}): SalesTargetAchievement {
  const { targets, invoices, range } = args
  const returns = args.returns ?? []
  const invoiceById = invoiceMap(invoices)
  const nameOf = new Map<number, string>()
  for (const t of targets) nameOf.set(t.salesEmployeeId, t.salesEmployeeName)
  for (const inv of invoices) {
    if (inv.salesEmployeeId !== null && inv.salesEmployeeName && !nameOf.has(inv.salesEmployeeId)) {
      nameOf.set(inv.salesEmployeeId, inv.salesEmployeeName)
    }
  }

  // Plafon per faktur asal (Putusan 2.5): tahan Σ pengurang pada grandTotal.
  const rawByInvoice = new Map<number, number>()
  for (const ret of returns) {
    const inv = invoiceById.get(ret.salesInvoiceId)
    if (!inv) continue
    rawByInvoice.set(ret.salesInvoiceId, safeAdd(rawByInvoice.get(ret.salesInvoiceId) ?? 0, returnCommercialValue(ret, inv), 2))
  }
  const capByInvoice = new Map<number, number>()
  const invoiceDeductionClampFindings: SalesTargetDeductionClampFinding[] = []
  for (const [invoiceId, raw] of rawByInvoice) {
    const inv = invoiceById.get(invoiceId)!
    const clamped = safeRound(Math.min(raw, Math.max(inv.grandTotal, 0)), 2)
    capByInvoice.set(invoiceId, clamped)
    if (clamped < raw) {
      invoiceDeductionClampFindings.push({
        salesInvoiceId: invoiceId,
        salesEmployeeId: inv.salesEmployeeId,
        grandTotal: inv.grandTotal,
        rawDeductionAmount: raw,
        clampedDeductionAmount: clamped,
      })
    }
  }
  invoiceDeductionClampFindings.sort((a, b) => a.salesInvoiceId - b.salesInvoiceId)

  // Skala per faktur dari plafon; retur diratakan pro-rata ke allowed.
  const factorByInvoice = new Map<number, number>()
  for (const [invoiceId, raw] of rawByInvoice) {
    if (raw > 0) factorByInvoice.set(invoiceId, (capByInvoice.get(invoiceId) ?? 0) / raw)
  }
  const effectiveReturns = returns
    .map((ret) => {
      const inv = invoiceById.get(ret.salesInvoiceId)
      if (!inv) return null
      const values = returnLineValues(ret, inv)
      const factor = factorByInvoice.get(ret.salesInvoiceId) ?? 1
      return {
        ret,
        invoice: inv,
        deduction: safeRound(values.total * factor, 2),
        legacyDeduction: safeRound(values.legacy * factor, 2),
        isUnattributed: inv.salesEmployeeId === null,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  const legacyReturns: SalesTargetLegacyReturn[] = effectiveReturns
    .filter((er) => er.legacyDeduction > 0)
    .map((er) => ({
      returnId: er.ret.id,
      salesInvoiceId: er.ret.salesInvoiceId,
      salesEmployeeId: er.invoice.salesEmployeeId,
      label: SALES_TARGET_LEGACY_LABEL,
      deductionAmount: er.legacyDeduction,
    }))
    .sort((a, b) => a.returnId - b.returnId)

  // Komponen per (penjual) di jendela arbitrer — basis komisi sama.
  const componentsIn = (employeeId: number, start: Date, end: Date) => {
    let grossPaidAmount = 0
    let invoiceCount = 0
    for (const inv of invoices) {
      if (inv.salesEmployeeId !== employeeId) continue
      if (!inDayRange(inv.date, start, end)) continue
      grossPaidAmount = safeAdd(grossPaidAmount, inv.grandTotal, 2)
      invoiceCount += 1
    }
    let returnDeductionAmount = 0
    let legacyReturnDeductionAmount = 0
    let returnCount = 0
    for (const er of effectiveReturns) {
      if (er.isUnattributed) continue
      if (er.invoice.salesEmployeeId !== employeeId) continue
      if (!inDayRange(er.ret.date, start, end)) continue
      returnDeductionAmount = safeAdd(returnDeductionAmount, er.deduction, 2)
      legacyReturnDeductionAmount = safeAdd(legacyReturnDeductionAmount, er.legacyDeduction, 2)
      returnCount += 1
    }
    return {
      grossPaidAmount,
      returnDeductionAmount,
      legacyReturnDeductionAmount,
      hasLegacyReturnLines: legacyReturnDeductionAmount > 0,
      achievedAmount: safeSubtract(grossPaidAmount, returnDeductionAmount, 2),
      invoiceCount,
      returnCount,
    }
  }

  const sortedTargets = [...targets].sort((a, b) => {
    const byStart = a.periodStart.getTime() - b.periodStart.getTime()
    if (byStart !== 0) return byStart
    return a.id - b.id
  })

  const rows: SalesTargetAchievementRow[] = sortedTargets.map((t) => {
    const contained =
      t.periodStart.getTime() >= range.start.getTime() &&
      t.periodEnd.getTime() <= range.end.getTime()
    const c = componentsIn(t.salesEmployeeId, t.periodStart, t.periodEnd)
    return {
      targetId: t.id,
      salesEmployeeId: t.salesEmployeeId,
      salesEmployeeName: t.salesEmployeeName,
      periodStart: t.periodStart,
      periodEnd: t.periodEnd,
      targetAmount: t.targetAmount,
      notes: t.notes,
      grossPaidAmount: c.grossPaidAmount,
      returnDeductionAmount: c.returnDeductionAmount,
      achievedAmount: c.achievedAmount,
      achievementPercent: contained ? percent(c.achievedAmount, t.targetAmount) : null,
      gapAmount: contained ? safeSubtract(c.achievedAmount, t.targetAmount, 2) : null,
      invoiceCount: c.invoiceCount,
      returnCount: c.returnCount,
      hasLegacyReturnLines: c.hasLegacyReturnLines,
      legacyReturnDeductionAmount: c.legacyReturnDeductionAmount,
      periodFullyContained: contained,
      hasTarget: true,
      modifiedAfterPeriodStartAt: t.modifiedAfterPeriodStartAt,
    }
  })

  const targetedIds = new Set(sortedTargets.map((t) => t.salesEmployeeId))
  const noTargetById = new Map<number, SalesTargetAchievementRow>()
  let unattrCount = 0
  let unattrGross = 0
  let unattrDeduction = 0
  let unattrLegacyDeduction = 0
  const ensureNoTargetRow = (employeeId: number): SalesTargetAchievementRow => {
    const existing = noTargetById.get(employeeId)
    if (existing) return existing
    const row: SalesTargetAchievementRow = {
      targetId: null,
      salesEmployeeId: employeeId,
      salesEmployeeName: nameOf.get(employeeId) ?? "",
      periodStart: null,
      periodEnd: null,
      targetAmount: null,
      notes: null,
      grossPaidAmount: 0,
      returnDeductionAmount: 0,
      achievedAmount: 0,
      achievementPercent: null,
      gapAmount: null,
      invoiceCount: 0,
      returnCount: 0,
      hasLegacyReturnLines: false,
      legacyReturnDeductionAmount: 0,
      periodFullyContained: false,
      hasTarget: false,
      modifiedAfterPeriodStartAt: null,
    }
    noTargetById.set(employeeId, row)
    return row
  }
  for (const inv of invoices) {
    if (!inRange(inv.date, range.start, range.end)) continue
    if (inv.salesEmployeeId === null) {
      unattrCount += 1
      unattrGross = safeAdd(unattrGross, inv.grandTotal, 2)
      continue
    }
    if (targetedIds.has(inv.salesEmployeeId)) continue
    const row = ensureNoTargetRow(inv.salesEmployeeId)
    row.grossPaidAmount = safeAdd(row.grossPaidAmount, inv.grandTotal, 2)
    row.invoiceCount += 1
    if (!row.salesEmployeeName && inv.salesEmployeeName) row.salesEmployeeName = inv.salesEmployeeName
  }
  for (const er of effectiveReturns) {
    if (!inRange(er.ret.date, range.start, range.end)) continue
    if (er.isUnattributed) {
      unattrDeduction = safeAdd(unattrDeduction, er.deduction, 2)
      unattrLegacyDeduction = safeAdd(unattrLegacyDeduction, er.legacyDeduction, 2)
      continue
    }
    const employeeId = er.invoice.salesEmployeeId
    if (employeeId === null || targetedIds.has(employeeId)) continue
    const row = ensureNoTargetRow(employeeId)
    row.returnDeductionAmount = safeAdd(row.returnDeductionAmount, er.deduction, 2)
    row.legacyReturnDeductionAmount = safeAdd(row.legacyReturnDeductionAmount, er.legacyDeduction, 2)
    row.hasLegacyReturnLines = row.legacyReturnDeductionAmount > 0
    row.returnCount += 1
    if (!row.salesEmployeeName && er.invoice.salesEmployeeName) row.salesEmployeeName = er.invoice.salesEmployeeName
  }
  for (const row of noTargetById.values()) {
    row.achievedAmount = safeSubtract(row.grossPaidAmount, row.returnDeductionAmount, 2)
  }

  const noTargetRows = [...noTargetById.values()].sort(
    (a, b) => b.achievedAmount - a.achievedAmount || a.salesEmployeeId - b.salesEmployeeId,
  )

  const assessed = rows.filter((r) => r.periodFullyContained)
  const totalAchievedForPercent = assessed.reduce((s, r) => safeAdd(s, r.achievedAmount, 2), 0)
  const totalTargetAmount = assessed.reduce((s, r) => safeAdd(s, r.targetAmount ?? 0, 2), 0)
  const unattrAchieved = safeSubtract(unattrGross, unattrDeduction, 2)
  const totalGrossPaidAmount = safeAdd(
    assessed.reduce((s, r) => safeAdd(s, r.grossPaidAmount, 2), 0),
    unattrGross,
    2,
  )
  const totalReturnDeductionAmount = safeAdd(
    assessed.reduce((s, r) => safeAdd(s, r.returnDeductionAmount, 2), 0),
    unattrDeduction,
    2,
  )
  const totalAchievedAmount = safeAdd(totalAchievedForPercent, unattrAchieved, 2)

  return {
    rows,
    noTargetRows,
    unattributed: {
      label: SALES_TARGET_UNATTRIBUTED_LABEL,
      invoiceCount: unattrCount,
      grossPaidAmount: unattrGross,
      returnDeductionAmount: unattrDeduction,
      achievedAmount: unattrAchieved,
      hasLegacyReturnLines: unattrLegacyDeduction > 0,
      legacyReturnDeductionAmount: unattrLegacyDeduction,
    },
    totalGrossPaidAmount,
    totalReturnDeductionAmount,
    totalAchievedAmount,
    totalTargetAmount,
    totalAchievedForPercent,
    companyPercent:
      assessed.length > 0 && totalTargetAmount > 0
        ? percent(totalAchievedForPercent, totalTargetAmount)
        : null,
    invoiceDeductionClampFindings,
    legacyReturns,
    notice: SALES_TARGET_NOTICE,
  }
}

export interface SalesTargetCommissionCrosscheckInput {
  salesEmployeeId: number | null
  /** paidBase rekap komisi dari builder komisi (bukan hitung ulang target). */
  paidBase: number
}

export interface SalesTargetIndependentReturnLine {
  returnDpp: number | null
  returnVat: number | null
  qty: number
  price: number
}

export interface SalesTargetIndependentReturnInput {
  salesInvoiceId: number
  salesEmployeeId: number | null
  lines: readonly SalesTargetIndependentReturnLine[]
}

export interface SalesTargetJournalReturnLineInput {
  /** Kaki debit akun Retur Penjualan pada jurnal retur POSTED; null = akun belum dipetakan. */
  debitAmount: number | null
}

export interface SalesTargetPeriodReconciliationFinding {
  code: "GROSS_VS_COMMISSION_MISMATCH" | "INDEPENDENT_RETURN_MISMATCH" | "JOURNAL_RETURN_DIFF"
  message: string
}

export interface SalesTargetPeriodReconciliationRow {
  salesEmployeeId: number | null
  grossPaidAmount: number
  commissionPaidBase: number | null
  commissionDifference: number | null
  returnDeductionAmount: number
  independentReturnDeductionAmount: number | null
  independentDifference: number | null
  postedJournalReturnAmount: number | null
  journalDifference: number | null
  achievedAmount: number
  findings: SalesTargetPeriodReconciliationFinding[]
}

export interface SalesTargetPeriodReconciliation {
  rows: SalesTargetPeriodReconciliationRow[]
  /** Finding non-baris: plafon per faktur asal (Putusan 2.5). */
  invoiceDeductionClampFindings: SalesTargetDeductionClampFinding[]
  totals: {
    grossPaidAmount: number
    commissionPaidBase: number
    commissionDifference: number
    returnDeductionAmount: number
    independentReturnDeductionAmount: number
    independentDifference: number
    postedJournalReturnAmount: number | null
    journalDifference: number | null
    achievedAmount: number
  }
  findings: SalesTargetPeriodReconciliationFinding[]
}

function independentReturnValue(
  ret: SalesTargetIndependentReturnInput,
  invoiceById: ReadonlyMap<number, SalesTargetPaidInvoiceInput>,
): number {
  const inv = invoiceById.get(ret.salesInvoiceId)
  return returnCommercialValue(
    { id: 0, date: new Date(0), salesInvoiceId: ret.salesInvoiceId, lines: ret.lines },
    inv,
  )
}

/**
 * Rekonsiliasi tiga arah satu periode (F-131-V Putusan 5):
 * (i) grossPaidAmount target vs paidBase komisi (pengganti kunci lama
 *     AC-TGT-10 — komisi tidak diubah, hanya dibandingkan);
 * (ii) returnDeductionAmount read-model vs Σ snapshot query sumber
 *     independen (baris legacy diturunkan dengan tarif faktur asal sama);
 * (iii) total kaki Retur Penjualan jurnal retur POSTED sebagai temuan
 *     bernama — penyebab sah: jurnal berbahan qty×price (bukan
 *     DPP+PPN), retur tanpa kaki harga, clamp. Selisih tidak dipilih
 *     diam-diam salah satu.
 * Retur dengan salesEmployeeId null pada query independen diatribusikan
 * lewat snapshot faktur asal di `invoices` (bukan ditebak).
 */
export function buildSalesTargetPeriodReconciliation(args: {
  achievement: SalesTargetAchievement
  invoices: readonly SalesTargetPaidInvoiceInput[]
  commissionRows: readonly SalesTargetCommissionCrosscheckInput[]
  independentReturns: readonly SalesTargetIndependentReturnInput[]
  /** null = akun Retur Penjualan belum dipetakan; kaki jurnal tak terukur. */
  postedJournalReturn: SalesTargetJournalReturnLineInput | null
}): SalesTargetPeriodReconciliation {
  const { achievement, invoices, commissionRows, independentReturns, postedJournalReturn } = args
  const invoiceById = invoiceMap(invoices)
  const employeeOfInvoice = (invoiceId: number) => invoiceById.get(invoiceId)?.salesEmployeeId ?? null

  const commissionByEmployee = new Map<number | null, number>()
  for (const row of commissionRows) {
    commissionByEmployee.set(
      row.salesEmployeeId,
      safeAdd(commissionByEmployee.get(row.salesEmployeeId) ?? 0, row.paidBase, 2),
    )
  }
  const indepByEmployee = new Map<number | null, number>()
  for (const ret of independentReturns) {
    const employeeId = ret.salesEmployeeId ?? employeeOfInvoice(ret.salesInvoiceId)
    indepByEmployee.set(
      employeeId,
      safeAdd(indepByEmployee.get(employeeId) ?? 0, independentReturnValue(ret, invoiceById), 2),
    )
  }

  type Agg = { gross: number; deduction: number; achieved: number }
  const targetByEmployee = new Map<number | null, Agg>()
  const addAgg = (id: number | null, gross: number, deduction: number, achieved: number) => {
    const cur = targetByEmployee.get(id) ?? { gross: 0, deduction: 0, achieved: 0 }
    cur.gross = safeAdd(cur.gross, gross, 2)
    cur.deduction = safeAdd(cur.deduction, deduction, 2)
    cur.achieved = safeAdd(cur.achieved, achieved, 2)
    targetByEmployee.set(id, cur)
  }
  for (const row of achievement.rows) {
    if (!row.periodFullyContained) continue
    addAgg(row.salesEmployeeId, row.grossPaidAmount, row.returnDeductionAmount, row.achievedAmount)
  }
  for (const row of achievement.noTargetRows) {
    addAgg(row.salesEmployeeId, row.grossPaidAmount, row.returnDeductionAmount, row.achievedAmount)
  }
  addAgg(null, achievement.unattributed.grossPaidAmount, achievement.unattributed.returnDeductionAmount, achievement.unattributed.achievedAmount)

  const ids = new Set<number | null>([
    ...targetByEmployee.keys(),
    ...commissionByEmployee.keys(),
    ...indepByEmployee.keys(),
  ])
  const rows: SalesTargetPeriodReconciliationRow[] = [...ids].map((employeeId) => {
    const agg = targetByEmployee.get(employeeId) ?? { gross: 0, deduction: 0, achieved: 0 }
    const commission = commissionByEmployee.get(employeeId) ?? null
    const commissionDifference =
      commission === null ? null : safeSubtract(agg.gross, commission, 2)
    const independent = indepByEmployee.get(employeeId) ?? 0
    const independentDifference = safeSubtract(agg.deduction, independent, 2)
    const findings: SalesTargetPeriodReconciliationFinding[] = []
    if (commissionDifference !== null && commissionDifference !== 0) {
      findings.push({
        code: "GROSS_VS_COMMISSION_MISMATCH",
        message:
          `Komponen bruto target penjual ${employeeId ?? "tanpa penjual"} berbeda dari paidBase komisi sebesar Rp ${formatNumber(commissionDifference)} pada periode sama.`,
      })
    }
    if (independentDifference !== 0) {
      findings.push({
        code: "INDEPENDENT_RETURN_MISMATCH",
        message:
          `Pengurang retur read-model penjual ${employeeId ?? "tanpa penjual"} berbeda dari query sumber independen sebesar Rp ${formatNumber(independentDifference)}.`,
      })
    }
    return {
      salesEmployeeId: employeeId,
      grossPaidAmount: agg.gross,
      commissionPaidBase: commission,
      commissionDifference,
      returnDeductionAmount: agg.deduction,
      independentReturnDeductionAmount: independent,
      independentDifference,
      // Jurnal direkonsiliasi di level periode (total), bukan per penjual:
      // jurnal tidak membawa snapshot penjual.
      postedJournalReturnAmount: null,
      journalDifference: null,
      achievedAmount: agg.achieved,
      findings,
    }
  })
  rows.sort((a, b) => (a.salesEmployeeId ?? -1) - (b.salesEmployeeId ?? -1))

  const totalGross = rows.reduce((s, r) => safeAdd(s, r.grossPaidAmount, 2), 0)
  const totalCommission = rows.reduce((s, r) => safeAdd(s, r.commissionPaidBase ?? 0, 2), 0)
  const totalDeduction = rows.reduce((s, r) => safeAdd(s, r.returnDeductionAmount, 2), 0)
  const totalIndependent = rows.reduce((s, r) => safeAdd(s, r.independentReturnDeductionAmount ?? 0, 2), 0)
  const totalAchieved = rows.reduce((s, r) => safeAdd(s, r.achievedAmount, 2), 0)
  const journalAmount = postedJournalReturn?.debitAmount ?? null
  const journalDifference =
    journalAmount === null ? null : safeSubtract(totalDeduction, journalAmount, 2)
  const findings: SalesTargetPeriodReconciliationFinding[] = []
  if (journalDifference !== null && journalDifference !== 0) {
    findings.push({
      code: "JOURNAL_RETURN_DIFF",
      message:
        `Pengurang retur read-model berbeda dari total kaki Retur Penjualan jurnal retur POSTED sebesar Rp ${formatNumber(journalDifference)}; penyebab sah antara lain jurnal memakai nilai qty × harga, retur tanpa faktur asal, baris legacy, atau plafon per faktur asal.`,
    })
  }

  return {
    rows,
    invoiceDeductionClampFindings: achievement.invoiceDeductionClampFindings,
    totals: {
      grossPaidAmount: totalGross,
      commissionPaidBase: totalCommission,
      commissionDifference: safeSubtract(totalGross, totalCommission, 2),
      returnDeductionAmount: totalDeduction,
      independentReturnDeductionAmount: totalIndependent,
      independentDifference: safeSubtract(totalDeduction, totalIndependent, 2),
      postedJournalReturnAmount: journalAmount,
      journalDifference,
      achievedAmount: totalAchieved,
    },
    findings,
  }
}

/** Dua periode inklusif bertumpukan? Bersebelahan (end H, start H+1) TIDAK tumpuk. */
export function salesTargetPeriodsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime()
}

export function findOverlappingSalesTarget<
  T extends { id: number; periodStart: Date; periodEnd: Date },
>(
  existing: readonly T[],
  candidate: { periodStart: Date; periodEnd: Date; excludeId?: number },
): T | null {
  for (const t of existing) {
    if (candidate.excludeId !== undefined && t.id === candidate.excludeId) continue
    if (salesTargetPeriodsOverlap(t.periodStart, t.periodEnd, candidate.periodStart, candidate.periodEnd)) {
      return t
    }
  }
  return null
}

/** Pesan validasi simpan target (BR-TGT-03/04) atau null bila sah. */
export function validateSalesTargetInput(input: {
  targetAmount: number
  periodStart: Date
  periodEnd: Date
}): string | null {
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    return "Nominal target wajib lebih besar dari 0"
  }
  if (input.periodEnd.getTime() < input.periodStart.getTime()) {
    return "Tanggal selesai periode tidak boleh sebelum tanggal mulai"
  }
  return null
}
