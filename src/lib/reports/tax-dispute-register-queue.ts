/**
 * F-2026-10-27-113-S tahap 113-B — register ketetapan + upaya sengketa pajak.
 *
 * Register dokumen SAJA (BR-TXD-11): NOL jurnal, NOL tulis TaxPayment.
 * Lapis jurnal = sub-tahap terpisah dari vonis 163-V (jawaban Q-TXD-1..5).
 *
 * PUTUSAN LEAD Q-TXD-6..8 (29 Okt 2026, PR #1407 — final):
 * - Q-TXD-6: kata §1 verbatim — register Ketetapan Pajak, anak Upaya
 *   Sengketa; kolom Nominal Ketetapan / Nominal Disengketakan /
 *   Dibayar di Bawah Protes / Tenggat Upaya. Enum jenis ketetapan
 *   SKPKB/SKPKBT/SKPLB/SKPN/PEMUNGUTAN_PIHAK_KETIGA; jenis upaya
 *   KEBERATAN/PENGURANGAN_PEMBATALAN/BANDING/GUGATAN/PENINJAUAN_KEMBALI;
 *   hasil DIKABULKAN/DIKABULKAN_SEBAGIAN/DITOLAK/TIDAK_DAPAT_DITERIMA.
 * - Q-TXD-7: "3 bulan kalender" = tanggal acuan + 3 bulan kalender
 *   (bulan pendek = hari terakhir bulan itu), batas 23:59:59 WIB.
 *   "14 hari" gugatan = +14 hari kalender, 23:59:59 WIB. TANPA geser
 *   hari kerja/libur. Satu fungsi bernama di sini untuk semua tenggat;
 *   angka tenggat di luar fungsi ini = MERAH.
 * - Q-TXD-8: key BARU view/create/edit_tax_disputes; empat mata:
 *   pencatat putusan != pengaju upaya (ditegakkan di server action).
 *
 * Pure (tanpa Prisma/DOM). Loader: `tax-dispute-register-queue-data.ts`.
 */

export const TAX_ASSESSMENT_KINDS = [
  "SKPKB",
  "SKPKBT",
  "SKPLB",
  "SKPN",
  "PEMUNGUTAN_PIHAK_KETIGA",
] as const

export type TaxAssessmentKind = (typeof TAX_ASSESSMENT_KINDS)[number]

export const TAX_DISPUTE_STEP_KINDS = [
  "KEBERATAN",
  "PENGURANGAN_PEMBATALAN",
  "BANDING",
  "GUGATAN",
  "PENINJAUAN_KEMBALI",
] as const

export type TaxDisputeStepKind = (typeof TAX_DISPUTE_STEP_KINDS)[number]

/** Sub-jenis Pasal 36 ayat (1) UU KUP (vonis 163-V Putusan 5, kata final Lead Q-TXD-6). */
export const TAX_DISPUTE_PASAL36_SUBKINDS = [
  "SANKSI_KURANG_HAPUS",
  "SKP_KURANG_BATAL",
  "STP_KURANG_BATAL",
  "BATAL_DEMI_HUKUM",
] as const

export type TaxDisputePasal36Subkind = (typeof TAX_DISPUTE_PASAL36_SUBKINDS)[number]

export const TAX_DISPUTE_STEP_RESULTS = [
  "DIKABULKAN",
  "DIKABULKAN_SEBAGIAN",
  "DITOLAK",
  "TIDAK_DAPAT_DITERIMA",
] as const

export type TaxDisputeStepResult = (typeof TAX_DISPUTE_STEP_RESULTS)[number]

export const TAX_DISPUTE_LATE_FLAG = "LEWAT_TENGGAT" as const

/** Judul antrean verbatim Q-TXD-6 — UI menempel apa adanya. */
export const TAX_DISPUTE_REGISTER_TITLE = "Register Ketetapan Pajak"

/** Label kolom verbatim Q-TXD-6 — UI menempel apa adanya. */
export const TAX_DISPUTE_REGISTER_COLUMN_LABELS = {
  assessmentNumber: "Nomor Ketetapan",
  assessmentKind: "Jenis Ketetapan",
  assessedAmount: "Nominal Ketetapan",
  disputedAmount: "Nominal Disengketakan",
  paidUnderProtest: "Dibayar di Bawah Protes",
  stepDeadline: "Tenggat Upaya",
} as const

/**
 * Tenggat sengketa tunggal milik 113-B (Q-TXD-7).
 * `months` = bulan kalender sejak tanggal acuan WIB (basis TANGGAL KIRIM,
 * bukan tanggal terima internal — AC-TXD-B1; terima = MERAH).
 * Bulan pendek: hari terakhir bulan hasil. Batas 23:59:59 WIB.
 */
export function addCalendarMonthsWib(base: Date, months: number): Date {
  const y = base.getFullYear()
  const m = base.getMonth()
  const d = base.getDate()
  const target = new Date(y, m + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d, lastDay))
  target.setHours(23, 59, 59, 0)
  return target
}

/**
 * Tenggat hari kalender (gugatan 14 hari, Q-TXD-7). Batas 23:59:59 WIB.
 * TANPA geser hari kerja/libur.
 */
export function addCalendarDaysWib(base: Date, days: number): Date {
  const out = new Date(base)
  out.setDate(out.getDate() + days)
  out.setHours(23, 59, 59, 0)
  return out
}

/** Batas bulan keberatan/banding/PK (Q-TXD-7: 3 bulan kalender). */
export const TAX_DISPUTE_OBJECTION_MONTHS = 3
/** Batas hari gugatan penagihan (Q-TXD-7: 14 hari kalender). */
export const TAX_DISPUTE_LAWSUIT_DAYS = 14

/** Batas bulan putusan keberatan DJP (benchmark: <=12 bulan). */
export const TAX_DISPUTE_DECISION_MONTHS = 12

export interface TaxDisputeStepInput {
  stepId: number
  kind: string
  article36Subkind: string | null
  /** Status upaya: aktif (diajukan/diproses) vs selesai. */
  status: string
  filedAt: Date | null
  decidedAt: Date | null
  decidedAmount: number | null
  lateReason: string | null
}

export interface TaxDisputeAssessmentInput {
  assessmentId: number
  slug: string | null
  assessmentNumber: string | null
  kind: string
  taxKind: string | null
  assessedAmount: number
  disputedAmount: number
  paidUnderProtest: number
  sentAt: Date | null
  status: string
  deletedAt: Date | null
  steps: TaxDisputeStepInput[]
}

export interface TaxDisputeAssessmentRow {
  assessmentId: number
  slug: string | null
  assessmentNumber: string | null
  kind: string
  taxKind: string | null
  assessedAmount: number
  disputedAmount: number
  paidUnderProtest: number
  remainingDisputed: number
  sentAt: Date | null
  /** Tenggat upaya aktif terdekat (server-side, basis sentAt). */
  nearestDeadline: Date | null
  lateSteps: number
  status: string
}

export interface TaxDisputeRegisterQueue {
  title: typeof TAX_DISPUTE_REGISTER_TITLE
  rows: TaxDisputeAssessmentRow[]
  totals: {
    assessments: number
    disputedAmount: number
    paidUnderProtest: number
    lateSteps: number
  }
}

function stepDeadline(kind: string, sentAt: Date | null, filedAt: Date | null): Date | null {
  // AC-TXD-B1 MERAH bila basis terima: kirim WAJIB didahulukan; filedAt
  // hanya cadangan bila sentAt belum tercatat (bukan pengganti kirim).
  const base = sentAt ?? filedAt
  if (!base) return null
  if (kind === "GUGATAN") return addCalendarDaysWib(base, TAX_DISPUTE_LAWSUIT_DAYS)
  if (
    kind === "KEBERATAN" ||
    kind === "BANDING" ||
    kind === "PENINJAUAN_KEMBALI" ||
    kind === "PENGURANGAN_PEMBATALAN"
  ) {
    return addCalendarMonthsWib(base, TAX_DISPUTE_OBJECTION_MONTHS)
  }
  return null
}

function isStepActive(status: string): boolean {
  return status !== "DIPUTUS" && status !== "DICABUT" && status !== "BATAL"
}

/**
 * Bangun antrean register ketetapan (murni, tanpa IO).
 * Sisa disengketakan = turunan server (AC-TXD-B6).
 * Hapus fisik mustahil di skema (hanya status batal) — builder mengabaikan
 * baris deletedAt non-null (baca lunak, bukan hapus).
 */
export function buildTaxDisputeRegisterQueue(
  assessments: TaxDisputeAssessmentInput[],
): TaxDisputeRegisterQueue {
  const rows: TaxDisputeAssessmentRow[] = []
  let disputedTotal = 0
  let paidTotal = 0
  let lateTotal = 0

  for (const a of assessments) {
    if (a.deletedAt) continue
    let decidedSum = 0
    let nearest: Date | null = null
    let late = 0
    for (const s of a.steps) {
      if (isStepActive(s.status)) {
        const dl = stepDeadline(s.kind, a.sentAt, s.filedAt)
        if (dl && (!nearest || dl.getTime() < nearest.getTime())) nearest = dl
        if (s.lateReason) late += 1
      }
      if (s.status === "DIPUTUS" && s.decidedAmount != null) {
        decidedSum += s.decidedAmount
      }
    }
    const remaining = Math.max(0, a.disputedAmount - decidedSum)
    lateTotal += late
    disputedTotal += a.disputedAmount
    paidTotal += a.paidUnderProtest
    rows.push({
      assessmentId: a.assessmentId,
      slug: a.slug,
      assessmentNumber: a.assessmentNumber,
      kind: a.kind,
      taxKind: a.taxKind,
      assessedAmount: a.assessedAmount,
      disputedAmount: a.disputedAmount,
      paidUnderProtest: a.paidUnderProtest,
      remainingDisputed: remaining,
      sentAt: a.sentAt,
      nearestDeadline: nearest,
      lateSteps: late,
      status: a.status,
    })
  }

  rows.sort((x, y) => {
    if (x.nearestDeadline && y.nearestDeadline) {
      return x.nearestDeadline.getTime() - y.nearestDeadline.getTime()
    }
    if (x.nearestDeadline) return -1
    if (y.nearestDeadline) return 1
    return x.assessmentId - y.assessmentId
  })

  return {
    title: TAX_DISPUTE_REGISTER_TITLE,
    rows,
    totals: {
      assessments: rows.length,
      disputedAmount: disputedTotal,
      paidUnderProtest: paidTotal,
      lateSteps: lateTotal,
    },
  }
}
