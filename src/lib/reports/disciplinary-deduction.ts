/**
 * Skorsing & potongan upah disiplin (F-2026-10-25-020-V / BR-DISC-09,
 * vonis BOT Accountant PR #824) — builder murni, tanpa Prisma.
 *
 * Hanya Putusan 3/5/6 yang dibangun di lapisan ini:
 * - Putusan 3: potongan (denda/ganti rugi) HANYA dari dokumen keputusan
 *   manusia tersendiri (nomor/tanggal/pejabat penandatangan). SP —
 *   termasuk SP3/SP pertama-dan-terakhir — TIDAK PERNAH memicu potongan.
 *   Larangan permanen, bukan penundaan fase. Plafon total potongan per
 *   pembayaran upah = 50% (PP 36/2021 Pasal 65).
 * - Putusan 1/2: skorsing proses PHK upah PENUH (tanpa opsi); skorsing
 *   disiplin hanya dari snapshot dokumen keputusan (penuh/proporsional/
 *   tidak dibayar), default tanpa dokumen = upah penuh.
 * - Putusan 4: PPh 21 & dasar BPJS dari bruto/upah AKTUAL masa itu.
 *   Potongan denda/ganti rugi TIDAK mengurangi bruto PPh 21.
 * - Putusan 6: idempotency key per (keputusan, periode, jenis).
 *
 * Angka uang number 2-desimal (pola builder payroll existing); service
 * yang menulis Decimal(15,2).
 */

export const DISCIPLINARY_DEDUCTION_KINDS = ["denda", "ganti_rugi"] as const
export type DisciplinaryDeductionKind = (typeof DISCIPLINARY_DEDUCTION_KINDS)[number]

export const SUSPENSION_KINDS = ["proses_phk", "disiplin"] as const
export type SuspensionKind = (typeof SUSPENSION_KINDS)[number]

export const SUSPENSION_PAY_TREATMENTS = ["penuh", "proporsional", "tidak_dibayar"] as const
export type SuspensionPayTreatment = (typeof SUSPENSION_PAY_TREATMENTS)[number]

/** Plafon potongan per pembayaran upah: 50% (PP 36/2021 Pasal 65). */
export const DISCIPLINARY_DEDUCTION_CAP_RATIO = 0.5

export function isDisciplinaryDeductionKind(value: unknown): value is DisciplinaryDeductionKind {
  return typeof value === "string" && (DISCIPLINARY_DEDUCTION_KINDS as readonly string[]).includes(value)
}

/** Dokumen keputusan manusia — SATU-SATUNYA pemicu potongan (Putusan 3). */
export interface DisciplinaryDecisionLike {
  id: number
  /** Nomor dokumen keputusan; kosong = bukan dokumen keputusan sah. */
  documentNo: string | null
  decidedAt: Date | null
  /** Pejabat penandatangan (Employee id); null = belum ditandatangani. */
  signedByEmployeeId: number | null
  kind: DisciplinaryDeductionKind
  /** Nominal potongan yang diputuskan (snapshot, bukan hitungan ulang). */
  amount: number
}

export type GuardResult = { allowed: true } | { allowed: false; message: string }
const ok: GuardResult = { allowed: true }
const deny = (message: string): GuardResult => ({ allowed: false, message })

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * QA-DISC09-1: tanpa dokumen keputusan manusia yang lengkap, potongan
 * disiplin TIDAK ADA. SP (recordId berapa pun jenjangnya) bukan pemicu —
 * fungsi ini sengaja tidak menerima rekod SP sama sekali.
 */
export function evaluateDisciplinaryDeductionDecision(
  decision: DisciplinaryDecisionLike | null,
): GuardResult {
  if (decision == null) {
    return deny(
      "Potongan upah disiplin wajib berbasis dokumen keputusan tersendiri; surat peringatan tidak memicu potongan",
    )
  }
  if (!decision.documentNo?.trim() || decision.decidedAt == null || decision.signedByEmployeeId == null) {
    return deny("Dokumen keputusan potongan belum lengkap (nomor, tanggal, dan pejabat penandatangan wajib ada)")
  }
  if (!isDisciplinaryDeductionKind(decision.kind)) {
    return deny("Jenis potongan disiplin tidak valid (hanya denda atau ganti rugi)")
  }
  if (!(decision.amount > 0)) {
    return deny("Nominal potongan pada dokumen keputusan harus lebih dari nol")
  }
  return ok
}

/** Potongan yang boleh diterapkan periode ini: 0 tanpa keputusan sah. */
export function disciplinaryDeductionForPeriod(input: {
  decision: DisciplinaryDecisionLike | null
  /** Upah pembayaran periode ini (dasar plafon 50%). */
  periodPay: number
  /** Potongan disiplin lain yang sudah diterapkan pada pembayaran sama. */
  alreadyApplied: number
}): { amount: number; guard: GuardResult } {
  const guard = evaluateDisciplinaryDeductionDecision(input.decision)
  if (!guard.allowed || input.decision == null) return { amount: 0, guard }
  const cap = round2(Math.max(0, input.periodPay) * DISCIPLINARY_DEDUCTION_CAP_RATIO)
  const remainingCap = round2(cap - Math.max(0, input.alreadyApplied))
  if (remainingCap <= 0) {
    return {
      amount: 0,
      guard: deny("Total potongan disiplin periode ini sudah mencapai plafon 50% upah pembayaran"),
    }
  }
  return { amount: Math.min(round2(input.decision.amount), remainingCap), guard: ok }
}

/**
 * Snapshot skorsing pada dokumen keputusan (Putusan 1/2). Kosong semua =
 * keputusan tanpa skorsing (sah). Jenis terisi -> perlakuan wajib; proses
 * PHK dipaksa "penuh"; disiplin wajib rujukan klausul PK/PP/PKB.
 */
export function evaluateSuspensionSnapshot(input: {
  suspensionKind: string | null
  payTreatment: string | null
  regulationReference: string | null
}): GuardResult {
  if (input.suspensionKind == null) {
    if (input.payTreatment != null) return deny("Perlakuan upah skorsing tidak boleh diisi tanpa jenis skorsing")
    return ok
  }
  if (!(SUSPENSION_KINDS as readonly string[]).includes(input.suspensionKind)) {
    return deny("Jenis skorsing tidak valid (proses_phk atau disiplin)")
  }
  if (input.payTreatment == null) {
    return deny("Perlakuan upah masa skorsing wajib dipilih pada dokumen keputusan")
  }
  if (!(SUSPENSION_PAY_TREATMENTS as readonly string[]).includes(input.payTreatment)) {
    return deny("Perlakuan upah skorsing tidak valid")
  }
  if (input.suspensionKind === "proses_phk" && input.payTreatment !== "penuh") {
    return deny("Skorsing dalam proses PHK wajib membayar upah beserta hak lainnya secara penuh")
  }
  if (input.suspensionKind === "disiplin" && !input.regulationReference?.trim()) {
    return deny("Skorsing disiplin wajib menyebut klausul PK/PP/PKB pada dokumen keputusan")
  }
  return ok
}

/**
 * QA-DISC09-2: upah masa skorsing. Tanpa dokumen keputusan bertanda
 * tangan = upah PENUH. Skorsing proses PHK selalu penuh (Putusan 1a) —
 * perlakuan lain pada jenis ini ditolak.
 */
export function suspensionPay(input: {
  kind: SuspensionKind
  treatment: SuspensionPayTreatment | null
  hasSignedDecision: boolean
  /** Upah penuh masa itu bila tidak skorsing. */
  fullPay: number
  /** Hari skors / hari kerja masa itu untuk perlakuan proporsional. */
  suspendedDays?: number
  workingDays?: number
}): { amount: number; guard: GuardResult } {
  const full = Math.max(0, input.fullPay)
  if (input.kind === "proses_phk") {
    if (input.treatment != null && input.treatment !== "penuh") {
      return {
        amount: full,
        guard: deny("Skorsing dalam proses PHK wajib membayar upah beserta hak lainnya secara penuh"),
      }
    }
    return { amount: full, guard: ok }
  }
  if (!input.hasSignedDecision) return { amount: full, guard: ok }
  if (input.treatment == null) {
    return { amount: full, guard: deny("Perlakuan upah skorsing disiplin wajib dipilih pada dokumen keputusan") }
  }
  if (input.treatment === "penuh") return { amount: full, guard: ok }
  if (input.treatment === "tidak_dibayar") return { amount: 0, guard: ok }
  const days = input.suspendedDays ?? 0
  const working = input.workingDays ?? 0
  if (working <= 0 || days < 0 || days > working) {
    return { amount: full, guard: deny("Hari skorsing/hari kerja untuk perlakuan proporsional tidak valid") }
  }
  return { amount: round2(full * ((working - days) / working)), guard: ok }
}

/**
 * QA-DISC09-3/4 (Putusan 4): dasar statutori selalu AKTUAL masa itu.
 * Bruto PPh 21 = upah aktual SEBELUM potongan denda/ganti rugi; dasar
 * BPJS = upah aktual yang dibayarkan. Upah aktual 0 -> dasar 0.
 */
export function statutoryBases(input: {
  actualGrossPay: number
  disciplinaryDeduction: number
}): { pph21Gross: number; bpjsWageBase: number } {
  const actual = Math.max(0, input.actualGrossPay)
  void input.disciplinaryDeduction // denda/ganti rugi tidak mengurangi bruto
  return { pph21Gross: round2(actual), bpjsWageBase: round2(actual) }
}

/** Putusan 6: kunci idempotensi per (keputusan, periode, jenis). */
export function disciplinaryDeductionIdempotencyKey(input: {
  decisionId: number
  period: string
  kind: DisciplinaryDeductionKind
}): string {
  return `disc09:${input.decisionId}:${input.period}:${input.kind}`
}
