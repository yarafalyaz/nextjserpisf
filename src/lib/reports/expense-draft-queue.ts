/**
 * F-2026-10-27-107-S (107-B+F) — antrean pengeluaran draft menunggu
 * persetujuan. Turunan murni baca-saja di atas Expense draft.
 *
 * PUTUSAN LEAD:
 * - Q-EXQ-1: `Mengendap` = umur >= 3 hari kalender WIB sejak
 *   `createdAt` (konstanta server bernama di bawah; == termasuk).
 * - Q-EXQ-2: kata verbatim di bawah — judul, kolom
 *   `Umur Menunggu`/`Keadaan Persetujuan`, ember pendamping.
 * - Q-EXQ-4: total tampil berlabel persis konstanta
 *   `EXPENSE_DRAFT_QUEUE_TOTAL_LABEL`; payload tanpa field/label
 *   di luar nominal tersimpan verbatim (vonis 111-V).
 * - Q-EXQ-5: seksi turunan di halaman pengeluaran existing (loader/UI).
 *
 * Populasi persis `status === "draft"` (BR-EXQ-01), klaim dan
 * non-klaim; model Expense tanpa `deletedAt` sehingga tidak ada
 * saringan soft-delete yang dikarang. Umur hanya dari `createdAt`
 * hari kalender WIB (BR-EXQ-03): `date` dokumen dan `updatedAt`
 * diterima sebagai bawaan rekod tetapi SENGAJA tidak dibaca untuk
 * umur — dokumen bertanggal lampau yang dibuat hari ini berumur 0.
 *
 * Keadaan pendamping (BR-EXQ-04/05) = rekod Approval TERBARU per
 * dokumen (createdAt terbaru, seri -> id terbesar); riwayat lama
 * tidak mencemari ember. Tanpa Approval = ember `tanpa workflow`,
 * bukan hilang. Approval `approved` dengan dokumen masih draft =
 * ember `workflow selesai — menunggu sinkron` terpisah terhitung.
 * Kunci urut ini sengaja berbasis createdAt sesuai kata spec
 * "terbaru"; pada data normal (id autoincrement, createdAt default
 * now) ia ekivalen dengan `orderBy id desc` yang dipakai gerbang
 * `assertApproved`, dan hanya berbeda pada rekod backfill/migrasi
 * yang createdAt-nya ditulis manual.
 *
 * Penanda klaim (BR-EXQ-06): `isReimbursementClaim` -> label
 * `Klaim Karyawan` + nama pengaju; bukti/kontak tidak masuk payload.
 * Urutan (BR-EXQ-10): mengendap dulu, lalu tertua, seri -> id naik.
 * Rekap ember/tingkat dari populasi PENUH sebelum potongan tampil;
 * total berlabel dihitung dari baris tampil sesuai katanya.
 *
 * Pure (tanpa Prisma/DOM). Loader: `expense-draft-queue-data.ts`.
 */

import { wibDayNumber } from "@/lib/reports/employee-lifecycle"
import { safeAdd } from "@/lib/utils/math"

/** Ambang Mengendap: umur >= 3 hari kalender WIB sejak createdAt (Q-EXQ-1). */
export const EXPENSE_DRAFT_MENGENDAP_MIN_DAYS = 3

/** Batas baris tampil; rekap tetap dari populasi penuh. */
export const EXPENSE_DRAFT_QUEUE_LIMIT = 100

/** Judul seksi verbatim Q-EXQ-2 — UI menempel apa adanya. */
export const EXPENSE_DRAFT_QUEUE_TITLE = "Pengeluaran Menunggu Persetujuan"

/** Label total verbatim Q-EXQ-4 / vonis 111-V — satu konstanta server. */
export const EXPENSE_DRAFT_QUEUE_TOTAL_LABEL =
  "total nominal tersimpan baris tampil — bukan saldo buku"

/** Label kolom verbatim Q-EXQ-2 — UI menempel apa adanya. */
export const EXPENSE_DRAFT_QUEUE_COLUMN_LABELS = {
  documentNo: "No. Dokumen",
  description: "Deskripsi",
  category: "Kategori",
  vendor: "Pemasok",
  project: "Proyek",
  claim: "Penanda Klaim",
  amount: "Nominal",
  umurMenunggu: "Umur Menunggu",
  tingkat: "Tingkat",
  keadaanPersetujuan: "Keadaan Persetujuan",
} as const

export const EXPENSE_DRAFT_QUEUE_NOTICE_TEXT =
  "Daftar pengeluaran yang masih draft dan menunggu keputusan. Umur dihitung sejak dokumen dibuat. Daftar ini baca-saja; keputusan dilakukan lewat detail pengeluaran yang ada."

export const EXPENSE_DRAFT_QUEUE_EMPTY_TEXT =
  "Tidak ada pengeluaran draft yang menunggu persetujuan."

export const EXPENSE_DRAFT_QUEUE_TRUNCATED_LABEL = "Terpotong"

/** Penanda klaim verbatim BR-EXQ-06. */
export const EXPENSE_DRAFT_CLAIM_LABEL = "Klaim Karyawan"

export const EXPENSE_DRAFT_LEVELS = ["mengendap", "menunggu"] as const

export type ExpenseDraftLevel = (typeof EXPENSE_DRAFT_LEVELS)[number]

export const EXPENSE_DRAFT_LEVEL_LABELS: Record<ExpenseDraftLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu",
}

export const EXPENSE_DRAFT_APPROVAL_BUCKETS = [
  "tanpa_workflow",
  "menunggu_langkah",
  "workflow_selesai_menunggu_sinkron",
  "workflow_ditolak",
  "keadaan_tidak_dikenal",
] as const

export type ExpenseDraftApprovalBucket =
  (typeof EXPENSE_DRAFT_APPROVAL_BUCKETS)[number]

/** Label ember pendamping verbatim Q-EXQ-2 — UI menempel apa adanya. */
export const EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS: Record<
  ExpenseDraftApprovalBucket,
  string
> = {
  tanpa_workflow: "tanpa workflow",
  menunggu_langkah: "menunggu langkah",
  workflow_selesai_menunggu_sinkron: "workflow selesai — menunggu sinkron",
  workflow_ditolak: "workflow ditolak",
  keadaan_tidak_dikenal: "keadaan tidak dikenal",
}

const LEVEL_RANK: Record<ExpenseDraftLevel, number> = {
  mengendap: 0,
  menunggu: 1,
}

export interface ExpenseDraftApprovalInput {
  approvalId: number
  /** Status Approval tersimpan apa adanya: pending/approved/rejected/... */
  status: string
  createdAt: Date
}

export interface ExpenseDraftInput {
  expenseId: number
  slug: string | null
  documentNo: string
  /** Status Expense apa adanya; builder hanya menerima persis "draft". */
  status: string
  /** Nominal tersimpan verbatim (Expense.amount). */
  amount: number
  /** Tanggal dokumen tersimpan — tampil apa adanya, BUKAN acuan umur. */
  date: Date
  createdAt: Date
  /** Bawaan rekod — SENGAJA tidak dibaca builder (BR-EXQ-03). */
  updatedAt?: Date | null
  isReimbursementClaim: boolean
  employeeId: number | null
  employeeName: string | null
  categoryName: string | null
  vendorName: string | null
  projectName: string | null
  description: string | null
  /** Semua rekod Approval dokumen ini; builder memilih yang terbaru. */
  approvals: ExpenseDraftApprovalInput[]
}

export interface ExpenseDraftRow {
  expenseId: number
  slug: string | null
  documentNo: string
  status: string
  amount: number
  date: Date
  createdAt: Date
  /** Hari kalender WIB sejak createdAt; masa depan ditahan 0. */
  umurMenungguHari: number
  umurMenungguLabel: string
  umurDariMasaDepan: boolean
  tingkat: ExpenseDraftLevel
  tingkatLabel: string
  /** Status Approval terbaru; null = tidak ada rekod Approval. */
  latestApprovalStatus: string | null
  latestApprovalId: number | null
  keadaanPendamping: ExpenseDraftApprovalBucket
  keadaanPendampingLabel: string
  isReimbursementClaim: boolean
  /** `Klaim Karyawan` untuk klaim; null untuk non-klaim (EC-EXQ-3). */
  claimLabel: string | null
  employeeId: number | null
  employeeName: string | null
  categoryName: string | null
  vendorName: string | null
  projectName: string | null
  description: string | null
}

export interface ExpenseDraftBucketRecapCell {
  count: number
  /** Σ amount tersimpan baris pada sel ini (populasi penuh). */
  totalAmount: number
}

export interface ExpenseDraftQueue {
  rows: ExpenseDraftRow[]
  /** Rekap per ember pendamping dari populasi PENUH (sebelum potong). */
  bucketRecap: Record<ExpenseDraftApprovalBucket, ExpenseDraftBucketRecapCell>
  /** Hitungan per tingkat dari populasi PENUH (sebelum potong). */
  levelCounts: Record<ExpenseDraftLevel, number>
  totalPopulation: number
  displayedCount: number
  /** Σ amount baris TAMPIL — berlabel `totalLabel` persis. */
  totalNominalBarisTampil: number
  totalLabel: string
  terpotong: boolean
  truncated: boolean
  limit: number
  noticeText: string
  title: string
}

function bucketFor(latestStatus: string | null): ExpenseDraftApprovalBucket {
  if (latestStatus === null) return "tanpa_workflow"
  if (latestStatus === "pending") return "menunggu_langkah"
  if (latestStatus === "approved") return "workflow_selesai_menunggu_sinkron"
  if (latestStatus === "rejected") return "workflow_ditolak"
  return "keadaan_tidak_dikenal"
}

function latestApproval(
  approvals: readonly ExpenseDraftApprovalInput[],
): ExpenseDraftApprovalInput | null {
  let latest: ExpenseDraftApprovalInput | null = null
  for (const approval of approvals) {
    if (latest === null) {
      latest = approval
      continue
    }
    const timeDiff = approval.createdAt.getTime() - latest.createdAt.getTime()
    if (timeDiff > 0 || (timeDiff === 0 && approval.approvalId > latest.approvalId)) {
      latest = approval
    }
  }
  return latest
}

function emptyBucketRecap(): Record<
  ExpenseDraftApprovalBucket,
  ExpenseDraftBucketRecapCell
> {
  return {
    tanpa_workflow: { count: 0, totalAmount: 0 },
    menunggu_langkah: { count: 0, totalAmount: 0 },
    workflow_selesai_menunggu_sinkron: { count: 0, totalAmount: 0 },
    workflow_ditolak: { count: 0, totalAmount: 0 },
    keadaan_tidak_dikenal: { count: 0, totalAmount: 0 },
  }
}

export function buildExpenseDraftQueue(
  inputs: readonly ExpenseDraftInput[],
  now: Date = new Date(),
  limit: number = EXPENSE_DRAFT_QUEUE_LIMIT,
): ExpenseDraftQueue {
  const todayNumber = wibDayNumber(now)
  const fullRows: ExpenseDraftRow[] = []

  for (const input of inputs) {
    // BR-EXQ-01: populasi persis draft — approved/paid/rejected dan
    // ejaan asing keluar walau Approval pendampingnya pending.
    if (input.status !== "draft") continue

    const diff = todayNumber - wibDayNumber(input.createdAt)
    const umurMenungguHari = Math.max(0, diff)
    const tingkat: ExpenseDraftLevel =
      umurMenungguHari >= EXPENSE_DRAFT_MENGENDAP_MIN_DAYS
        ? "mengendap"
        : "menunggu"
    const latest = latestApproval(input.approvals)
    const bucket = bucketFor(latest?.status ?? null)

    fullRows.push({
      expenseId: input.expenseId,
      slug: input.slug,
      documentNo: input.documentNo,
      status: input.status,
      amount: input.amount,
      date: input.date,
      createdAt: input.createdAt,
      umurMenungguHari,
      umurMenungguLabel: `${umurMenungguHari} hari`,
      umurDariMasaDepan: diff < 0,
      tingkat,
      tingkatLabel: EXPENSE_DRAFT_LEVEL_LABELS[tingkat],
      latestApprovalStatus: latest?.status ?? null,
      latestApprovalId: latest?.approvalId ?? null,
      keadaanPendamping: bucket,
      keadaanPendampingLabel: EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS[bucket],
      isReimbursementClaim: input.isReimbursementClaim,
      claimLabel: input.isReimbursementClaim ? EXPENSE_DRAFT_CLAIM_LABEL : null,
      employeeId: input.employeeId,
      // Nama pengaju hanya relevan (dan hanya tampil) pada baris klaim;
      // baris non-klaim tidak membawa nama karyawan ke payload daftar.
      employeeName: input.isReimbursementClaim ? input.employeeName : null,
      categoryName: input.categoryName,
      vendorName: input.vendorName,
      projectName: input.projectName,
      description: input.description,
    })
  }

  // BR-EXQ-10: mengendap dulu, lalu umur tertua (createdAt tertua),
  // seri createdAt sama -> id naik.
  fullRows.sort((a, b) => {
    const levelDiff = LEVEL_RANK[a.tingkat] - LEVEL_RANK[b.tingkat]
    if (levelDiff !== 0) return levelDiff
    const ageDiff = b.umurMenungguHari - a.umurMenungguHari
    if (ageDiff !== 0) return ageDiff
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
    if (createdDiff !== 0) return createdDiff
    return a.expenseId - b.expenseId
  })

  // Rekap dari populasi PENUH sebelum pemotongan tampil.
  const bucketRecap = emptyBucketRecap()
  const levelCounts: Record<ExpenseDraftLevel, number> = {
    mengendap: 0,
    menunggu: 0,
  }
  for (const row of fullRows) {
    const cell = bucketRecap[row.keadaanPendamping]
    cell.count += 1
    cell.totalAmount = safeAdd(cell.totalAmount, row.amount, 2)
    levelCounts[row.tingkat] += 1
  }

  const safeLimit = Math.max(0, Math.floor(limit))
  const rows = fullRows.slice(0, safeLimit)
  let totalNominalBarisTampil = 0
  for (const row of rows) {
    totalNominalBarisTampil = safeAdd(totalNominalBarisTampil, row.amount, 2)
  }

  return {
    rows,
    bucketRecap,
    levelCounts,
    totalPopulation: fullRows.length,
    displayedCount: rows.length,
    totalNominalBarisTampil,
    totalLabel: EXPENSE_DRAFT_QUEUE_TOTAL_LABEL,
    terpotong: fullRows.length > safeLimit,
    truncated: fullRows.length > safeLimit,
    limit: safeLimit,
    noticeText: EXPENSE_DRAFT_QUEUE_NOTICE_TEXT,
    title: EXPENSE_DRAFT_QUEUE_TITLE,
  }
}
