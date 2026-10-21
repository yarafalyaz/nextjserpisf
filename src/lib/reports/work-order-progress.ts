/**
 * Builder progres tahap WO (F-2026-10-21-020 A, vonis Lead t_0a5c5eff):
 * Q1 sekuensial-keras, Q2 skipped wajib notes, Q3 pendingCount = bahan
 * peringatan UI (complete tak diblokir). Denominator tanpa skipped;
 * 0/semua skipped -> percent null, bukan 0 karangan. Pure.
 */

export const WORK_ORDER_OPERATION_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
] as const

export type WorkOrderOperationStatus =
  (typeof WORK_ORDER_OPERATION_STATUSES)[number]

export const DEFAULT_WORK_ORDER_STAGES = [
  "Persiapan",
  "Pengerjaan",
  "Quality Check",
  "Selesai",
] as const

export const WORK_ORDER_PROGRESS_NOTICE = "Progres tahap perintah kerja (ringan, tanpa WorkCenter)."

export interface WorkOrderOperationInput {
  id: number
  name: string
  sortOrder: number
  status: string
  assignedEmployeeId: number | null
  estimatedHours: number | null
  notes: string | null
}

export interface WorkOrderOperationRow extends WorkOrderOperationInput {
  /** Tahap ini boleh mulai/selesai/lewati sekarang (urutan terpenuhi). */
  isActionable: boolean
  /** Nama tahap sebelumnya yang masih menggantung, bila terblokir urutan. */
  blockedByName: string | null
}

export interface WorkOrderProgressReport {
  rows: WorkOrderOperationRow[]
  totalStages: number
  completedCount: number
  skippedCount: number
  inProgressCount: number
  /** Baris belum tuntas (pending + in_progress) — bahan peringatan UI Q3. */
  pendingCount: number
  /** completed + skipped + in_progress + pending harus = totalStages. */
  denominator: number
  percent: number | null
  hasStages: boolean
  notice: string
}

/** Parse setting koma pola defaultProjectStages; kosong -> fallback vonis. */
export function parseWorkOrderStageNames(raw: string | null | undefined): string[] {
  const parsed = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : [...DEFAULT_WORK_ORDER_STAGES]
}

function isClosed(status: string): boolean {
  return status === "completed" || status === "skipped"
}

/**
 * Guard transisi murni (dipakai aksi server supaya aturan bisa diuji
 * tanpa mock Prisma, dan falsifikasi mencabutnya dari sini):
 * - target harus status sah;
 * - skipped wajib notes non-kosong;
 * - WO induk wajib in_progress;
 * - pindah ke pending (buka lagi) selalu boleh selama induk in_progress;
 * - maju (in_progress/completed/skipped) wajib semua tahap sebelumnya
 *   sudah completed/skipped (sekuensial-keras Q1).
 */
export function evaluateWorkOrderOperationTransition(input: {
  workOrderStatus: string
  operations: Array<{ sortOrder: number; status: string; name: string }>
  targetSortOrder: number
  targetStatus: string
  notes?: string | null
}): { ok: true } | { ok: false; error: string } {
  const { workOrderStatus, operations, targetSortOrder, targetStatus } = input
  if (!(WORK_ORDER_OPERATION_STATUSES as readonly string[]).includes(targetStatus)) {
    return {
      ok: false,
      error: `Status tahap '${targetStatus}' tidak valid. Gunakan: ${WORK_ORDER_OPERATION_STATUSES.join(", ")}`,
    }
  }
  if (targetStatus === "skipped" && !(input.notes ?? "").trim()) {
    return {
      ok: false,
      error: "Tahap yang dilewati wajib diisi alasan (notes) — melewati tahap mengubah dasar hitung progres.",
    }
  }
  if (workOrderStatus !== "in_progress") {
    return {
      ok: false,
      error: `Tahap hanya dapat diubah saat perintah kerja berstatus 'in_progress' (saat ini '${workOrderStatus}').`,
    }
  }
  if (targetStatus !== "pending") {
    const blocker = operations
      .filter((op) => op.sortOrder < targetSortOrder && !isClosed(op.status))
      .sort((a, b) => b.sortOrder - a.sortOrder)[0]
    if (blocker) {
      return {
        ok: false,
        error: `Tahap '${blocker.name}' belum selesai. Selesaikan tahap sebelumnya terlebih dahulu.`,
      }
    }
  }
  return { ok: true }
}

export function buildWorkOrderProgress(input: {
  operations: WorkOrderOperationInput[]
}): WorkOrderProgressReport {
  const sorted = [...input.operations].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  )
  const rows: WorkOrderOperationRow[] = sorted.map((op) => {
    const blocker = sorted
      .filter((o) => o.sortOrder < op.sortOrder && !isClosed(o.status))
      .sort((a, b) => b.sortOrder - a.sortOrder)[0]
    return {
      ...op,
      isActionable: !blocker,
      blockedByName: blocker ? blocker.name : null,
    }
  })

  const completedCount = sorted.filter((o) => o.status === "completed").length
  const skippedCount = sorted.filter((o) => o.status === "skipped").length
  const inProgressCount = sorted.filter((o) => o.status === "in_progress").length
  const pendingCount = sorted.filter(
    (o) => o.status === "pending" || o.status === "in_progress",
  ).length
  const denominator = sorted.length - skippedCount
  const percent =
    denominator > 0
      ? Math.round((completedCount / denominator) * 1000) / 10
      : null

  return {
    rows,
    totalStages: sorted.length,
    completedCount,
    skippedCount,
    inProgressCount,
    pendingCount,
    denominator,
    percent,
    hasStages: sorted.length > 0,
    notice: WORK_ORDER_PROGRESS_NOTICE,
  }
}
