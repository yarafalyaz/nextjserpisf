/**
 * F-2026-10-25-007-S tahap 1 — antrean persetujuan HR tertunda.
 * F-2026-10-25-018-S (BR-LS-06, Putusan Lead 026-L Q-LS-3a/Q-LS-5-spec):
 * kind `loan` bergabung — EmployeeLoan PERSIS `pending`, umur menunggu
 * sejak createdAt, nominal pinjaman (BUKAN gaji) tampil penuh dalam
 * scope; tanpa pendamping tanggal (loanDate masa lalu bukan tanggal
 * lewat keputusan).
 *
 * Lapisan ini SENGAJA tanpa Prisma/aksi/izin/schema: spec §9 menetapkan
 * inti sesudah putusan Lead Q-HP-1/2/4 + fisik Backend Q-HP-3. Yang
 * dikodekan di sini hanya aturan yang tidak menunggu putusan itu:
 * - BR-HP-01: anggota = LeaveRequest + OvertimeRequest berstatus PERSIS
 *   `pending`. Lembur `approved` hasil rantai ApprovalWorkflow (belum
 *   finalisasi `approveOvertime`) BUKAN pending dan TIDAK masuk
 *   (BR-HP-02).
 * - BR-HP-04: umur menunggu = hari kalender WIB sejak `createdAt`.
 *   `updatedAt` dilarang sebagai sumber umur.
 * - BR-HP-05: tahap turunan murni — MENUNGGU_KEPUTUSAN -> MENGENDAP
 *   (umur > ambang); pendamping MENDEKATI_MULAI (cuti) /
 *   TANGGAL_LEWAT_BELUM_DIPUTUS (lembur) bisa bersamaan. Urutan tampil:
 *   pendamping tanggal paling parah dulu, lalu MENGENDAP umur terbesar,
 *   lalu MENUNGGU umur terbesar; seri createdAt lalu id.
 * - BR-HP-06/10/11: builder/loader tidak memutus, tidak menulis, tidak
 *   auto-approve/reject, nol nominal/jurnal. Tipe baris di file ini
 *   tidak membawa `calculatedValue`/nominal gaji apa pun (BR-HP-08).
 * - BR-HP-07/12: cuti type/startDate/endDate/alasan verbatim; lembur
 *   date/hours verbatim + label proyek fakta; karyawan tanpa departemen
 *   tampil `—` (loader mengisi null, UI menempel `—`).
 *
 * Ambang = konstanta bernama di bawah (usul Q-HP-2, BELUM diputus Lead):
 * MENGENDAP 3 hari kalender sejak createdAt; MENDEKATI_MULAI cuti mulai
 * <= 3 hari kalender ke depan. Ubah KONSTANTA ini bila putusan berbeda.
 *
 * Pure (tanpa Prisma/DOM). Loader: `hr-pending-approval-data.ts`.
 * Hari kalender WIB reuse wibDayNumber dari employee-lifecycle.
 */

import { wibDayNumber } from "@/lib/reports/employee-lifecycle"

/* ------------------------------------------------------------------ */
/* Konstanta ambang (usul Q-HP-2 — satu titik ubah)                    */
/* ------------------------------------------------------------------ */

/** Ambang umur (hari kalender WIB sejak createdAt) untuk MENGENDAP. */
export const HR_PENDING_STALE_DAYS = 3
/** Ambang sisa hari ke tanggal mulai cuti untuk MENDEKATI_MULAI. */
export const HR_PENDING_LEAVE_NEAR_START_DAYS = 3

/* ------------------------------------------------------------------ */
/* Kosakata tertutup                                                   */
/* ------------------------------------------------------------------ */

export const HR_PENDING_KINDS = ["leave", "overtime", "loan"] as const
export type HrPendingKind = (typeof HR_PENDING_KINDS)[number]

export const HR_PENDING_BASE_STAGES = ["MENUNGGU_KEPUTUSAN", "MENGENDAP"] as const
export type HrPendingBaseStage = (typeof HR_PENDING_BASE_STAGES)[number]

export const HR_PENDING_DATE_FLAGS = [
  "MENDEKATI_MULAI",
  "TANGGAL_LEWAT_BELUM_DIPUTUS",
] as const
export type HrPendingDateFlag = (typeof HR_PENDING_DATE_FLAGS)[number]

export const HR_PENDING_BASE_STAGE_LABELS: Record<HrPendingBaseStage, string> = {
  MENUNGGU_KEPUTUSAN: "Menunggu Keputusan",
  MENGENDAP: "Mengendap",
}

export const HR_PENDING_DATE_FLAG_LABELS: Record<HrPendingDateFlag, string> = {
  MENDEKATI_MULAI: "Mendekati Tanggal Mulai",
  TANGGAL_LEWAT_BELUM_DIPUTUS: "Tanggal Lewat Belum Diputus",
}

/** Notice jujur — UI menempel apa adanya (BR-HP-09). */
export const HR_PENDING_NOTICE_TEXT =
  "Tahap dihitung dari tanggal pengajuan dan tanggal mulai/tanggal lembur. Keputusan tetap lewat aksi persetujuan existing per dokumen."

/* ------------------------------------------------------------------ */
/* Bentuk baris minimal (input murni, bukan tipe Prisma)               */
/* ------------------------------------------------------------------ */

export interface HrPendingApprovalInput {
  /** Id dokumen sumber (LeaveRequest.id / OvertimeRequest.id / EmployeeLoan.id). */
  id: number
  kind: HrPendingKind
  employeeId: number
  employeeName: string
  /** Null = karyawan tanpa departemen; tampil `—` (BR-HP-12). */
  departmentName: string | null
  /** Slug dokumen sumber bila ada — tautan detail existing, bukan aksi baru. */
  slug: string | null
  /** Status dokumen APA ADANYA; hanya `pending` yang lolos (BR-HP-01/02). */
  status: string
  createdAt: Date
  /** Cuti: startDate. Lembur: date. Pinjaman: loanDate. Acuan tahap tanggal. */
  eventDate: Date
  /** Cuti saja: endDate. Lembur/pinjaman: null. */
  endDate: Date | null
  /** Cuti: type verbatim. Lembur/pinjaman: null. */
  leaveType: string | null
  /** Lembur saja: hours decimal string apa adanya. Cuti/pinjaman: null. */
  hours: string | null
  /** Cuti/lembur: reason verbatim bila ada. Pinjaman: notes apa adanya. */
  reason: string | null
  /** Lembur saja: label proyek tertaut (fakta, bukan biaya). Cuti/pinjaman: null. */
  projectName: string | null
  /**
   * Pinjaman saja (Q-LS-3a 026-L): nominal pinjaman pengaju apa adanya —
   * totalAmount + cicilan tersimpan (bulanan; mingguan bila perjanjian
   * tertulis ada). Nominal PINJAMAN, bukan gaji — BR-HP-08 (tanpa nominal
   * gaji) tetap utuh. Cuti/lembur: null.
   */
  loanTotalAmount: string | null
  loanMonthlyInstallment: string | null
  loanWeeklyInstallment: string | null
}

export interface HrPendingApprovalRow extends HrPendingApprovalInput {
  tahapDasar: HrPendingBaseStage
  tahapDasarLabel: string
  /** Pendamping tanggal; bisa bersamaan tahapDasar (BR-HP-05). */
  penandaTanggal: HrPendingDateFlag | null
  penandaTanggalLabel: string | null
  /** Hari kalender WIB sejak createdAt (BR-HP-04). */
  umurMenungguHari: number
  /**
   * Hari kalender WIB dari hari acuan ke eventDate; negatif = sudah
   * lewat, 0 = hari ini, positif = hari ke depan.
   */
  sisaHariKeTanggal: number
}

/* ------------------------------------------------------------------ */
/* Turunan tahap                                                       */
/* ------------------------------------------------------------------ */

export function deriveHrPendingStage(
  input: Pick<HrPendingApprovalInput, "kind" | "createdAt" | "eventDate">,
  today: Date,
  staleDays: number = HR_PENDING_STALE_DAYS,
  nearStartDays: number = HR_PENDING_LEAVE_NEAR_START_DAYS,
): {
  tahapDasar: HrPendingBaseStage
  penandaTanggal: HrPendingDateFlag | null
  umurMenungguHari: number
  sisaHariKeTanggal: number
} {
  const todayDay = wibDayNumber(today)
  const umurMenungguHari = Math.max(0, todayDay - wibDayNumber(input.createdAt))
  const sisaHariKeTanggal = wibDayNumber(input.eventDate) - todayDay

  const tahapDasar: HrPendingBaseStage =
    umurMenungguHari > staleDays ? "MENGENDAP" : "MENUNGGU_KEPUTUSAN"

  let penandaTanggal: HrPendingDateFlag | null = null
  if (input.kind === "loan") {
    // Pinjaman (BR-LS-06/026-L): TIDAK ada pendamping tanggal — loanDate
    // masa lalu bukan "tanggal lewat belum diputus" (pinjaman pending
    // memang menunggu keputusan; umur menunggu sudah ditangkap tahapDasar).
    penandaTanggal = null
  } else if (input.kind === "overtime") {
    if (sisaHariKeTanggal < 0) penandaTanggal = "TANGGAL_LEWAT_BELUM_DIPUTUS"
  } else if (sisaHariKeTanggal < 0 || sisaHariKeTanggal <= nearStartDays) {
    // Cuti mulai sudah lewat tanpa keputusan (EC-1) = pendamping paling
    // parah juga; spec hanya menamai yang mendekati, jadi sisa negatif
    // tetap MENDEKATI_MULAI agar baris tidak kehilangan penanda tanggal.
    penandaTanggal = "MENDEKATI_MULAI"
  }

  return { tahapDasar, penandaTanggal, umurMenungguHari, sisaHariKeTanggal }
}

/* ------------------------------------------------------------------ */
/* Urutan tampil (BR-HP-05)                                            */
/* ------------------------------------------------------------------ */

/** Pendamping tanggal dulu; di dalamnya yang paling parah (sisa terkecil). */
function dateFlagRank(row: HrPendingApprovalRow): number {
  return row.penandaTanggal == null ? 1 : 0
}
function baseStageRank(row: HrPendingApprovalRow): number {
  return row.tahapDasar === "MENGENDAP" ? 0 : 1
}

export function compareHrPendingRows(
  a: HrPendingApprovalRow,
  b: HrPendingApprovalRow,
): number {
  const flagDiff = dateFlagRank(a) - dateFlagRank(b)
  if (flagDiff !== 0) return flagDiff
  if (a.penandaTanggal != null && b.penandaTanggal != null) {
    const sisaDiff = a.sisaHariKeTanggal - b.sisaHariKeTanggal
    if (sisaDiff !== 0) return sisaDiff
  }
  const stageDiff = baseStageRank(a) - baseStageRank(b)
  if (stageDiff !== 0) return stageDiff
  const ageDiff = b.umurMenungguHari - a.umurMenungguHari
  if (ageDiff !== 0) return ageDiff
  const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
  if (createdDiff !== 0) return createdDiff
  // Seri terakhir: jenis lalu id dokumen (id unik hanya per model).
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
  return a.id - b.id
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

/**
 * Bentuk antrean dari baris dokumen APA ADANYA. Hanya status persis
 * `pending` yang lolos (BR-HP-01/02, AC-HP-B1/B3); sisanya dibuang di
 * sini juga — loader menyaring di query, builder menyaring ulang supaya
 * pemanggil yang lupa menyaring tidak bisa meloloskan baris non-pending.
 */
export function buildHrPendingApprovalQueue(
  inputs: HrPendingApprovalInput[],
  today: Date = new Date(),
  staleDays: number = HR_PENDING_STALE_DAYS,
  nearStartDays: number = HR_PENDING_LEAVE_NEAR_START_DAYS,
): HrPendingApprovalRow[] {
  const rows: HrPendingApprovalRow[] = []
  for (const input of inputs) {
    if (input.status !== "pending") continue
    const derived = deriveHrPendingStage(input, today, staleDays, nearStartDays)
    rows.push({
      ...input,
      tahapDasar: derived.tahapDasar,
      tahapDasarLabel: HR_PENDING_BASE_STAGE_LABELS[derived.tahapDasar],
      penandaTanggal: derived.penandaTanggal,
      penandaTanggalLabel: derived.penandaTanggal
        ? HR_PENDING_DATE_FLAG_LABELS[derived.penandaTanggal]
        : null,
      umurMenungguHari: derived.umurMenungguHari,
      sisaHariKeTanggal: derived.sisaHariKeTanggal,
    })
  }
  return rows.sort(compareHrPendingRows)
}
