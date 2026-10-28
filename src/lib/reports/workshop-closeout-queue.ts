/**
 * Builder murni antrean "Job Selesai Belum Ditutup" (F-2026-10-24-097-S
 * S2, BR-CLOSE-02): WorkOrder + ProductionOrder berstatus `completed`
 * yang belum `closed`, dengan checklist rekonsiliasi pra-tutup C1-C8
 * teragregasi per job. Baca-saja: builder tidak menulis status, biaya,
 * atau jurnal apa pun; guard server di aksi tutup tetap penegak tunggal.
 *
 * Keputusan Q-CLOSE-3 (Backend, fisik): tanggal completed = `endDate`
 * — `completeWorkOrderTx` dan penyelesaian final PO menulis
 * `endDate = new Date()` pada klaim status completed yang sama, jadi
 * endDate adalah cap selesai yang sudah tersimpan terstruktur (tanpa
 * migrasi, tanpa menebak dari closedAt/createdAt). Baris legacy tanpa
 * endDate jatuh ke `updatedAt` dan DITANDAI `completedAtSource:
 * "updatedAt"` supaya UI menampilkan apa adanya, bukan tanggal karangan.
 * Umur = hari kalender sejak tanggal itu (dijepit >= 0).
 *
 * C1-C6 = prasyarat yang ditegakkan server saat tutup (pesan error-nya
 * meniru aksi tutup existing, bukan hitungan UI). C7/C8 = periksa manual
 * administrasi (BR-CLOSE-02): builder hanya menyajikan bukti banding
 * (PO pembelian tertaut WO + tagihannya, timesheet belum tertarik) —
 * C7/C8 tidak pernah mengubah `readyToClose` dan tidak menjadi gate.
 *
 * C5 (QC) jujur: `qcBlocked: null` = QC opt-in, belum ada inspeksi
 * final/NCR tercatat — server mengizinkan tutup pada keadaan itu
 * (pola qc.service existing), jadi checklist menampilkannya sebagai
 * "belum dinilai", bukan lolos karangan.
 *
 * Loader server-only: `workshop-closeout-queue-data.ts`.
 */

import { formatDate } from "@/lib/utils/format"
import { safeRound } from "@/lib/utils/math"

export const WORKSHOP_CLOSEOUT_QUEUE_TITLE = "Job Selesai Belum Ditutup"

export const WORKSHOP_CLOSEOUT_QUEUE_NOTICE_TEXT =
  "Daftar baca-saja: job berstatus completed yang belum ditutup (closed). Checklist C1-C6 mencerminkan prasyarat yang ditegakkan server saat tutup; C7-C8 adalah periksa manual administrasi dan tidak menahan tutup. Daftar ini tidak menutup job, tidak mengubah biaya, dan tidak memposting jurnal."

export const WORKSHOP_CLOSEOUT_QUEUE_EMPTY_TEXT =
  "Tidak ada job selesai yang belum ditutup saat ini."

export type CloseoutJobKind = "work_order" | "production_order"
export type CloseoutAgeBucketId = "d0_30" | "d31_60" | "d61_90" | "over90"
export type CompletedAtSource = "endDate" | "updatedAt"

export const WORKSHOP_CLOSEOUT_AGE_BUCKETS: { id: CloseoutAgeBucketId; label: string; maxDays: number | null }[] = [
  { id: "d0_30", label: "0-30 hari", maxDays: 30 },
  { id: "d31_60", label: "31-60 hari", maxDays: 60 },
  { id: "d61_90", label: "61-90 hari", maxDays: 90 },
  { id: "over90", label: ">90 hari", maxDays: null },
]

export interface CloseoutCheckState {
  /** true = lolos; false = menahan tutup; null = belum dinilai (C5 opt-in). */
  passed: boolean | null
  detail: string
}

/** Bukti banding C7/C8 (manual, tidak menahan tutup). */
export interface CloseoutManualEvidence {
  purchaseOrderCount: number
  purchaseOrdersWithoutBillCount: number
  vendorBillCount: number
  unpulledTimesheetCount: number
  c7Detail: string
  c8Detail: string
}

export interface CloseoutQueueJobInput {
  kind: CloseoutJobKind
  id: number
  slug: string | null
  documentNo: string
  status: string
  /** endDate klaim completed; null pada baris legacy -> updatedAt berlabel. */
  endDate: Date | null
  updatedAt: Date
  // Konteks tampil
  customerName: string | null
  plateNumber: string | null
  vehicleLabel: string | null
  /** Nama produk untuk PO; null untuk WO. */
  productName: string | null
  workOrderDocumentNo: string | null
  workOrderId: number | null
  // C1
  openProductionOrderCount: number
  firstOpenProductionOrder: { id: number; documentNo: string; status: string } | null
  // C2
  openMaterialIssueCount: number
  firstOpenMaterialIssue: { id: number; documentNo: string; status: string } | null
  // C3
  unpostedCostCount: number
  firstUnpostedCostId: number | null
  // C4 (hanya bermakna untuk PO dan anak PO di bawah WO)
  qty: number | null
  completedQty: number | null
  totalActualCost: number | null
  childWipResidualCount: number
  firstChildWipResidual: { id: number; documentNo: string; totalActualCost: number } | null
  // C5: null = tidak ada inspeksi final/NCR tercatat (opt-in, belum dinilai)
  qcBlocked: boolean | null
  qcDetail: string
  // C6: tanggal tutup (asOf) sesudah periodLockDate?
  periodClosed: boolean
  periodLockDate: Date | null
  // C7/C8 bukti banding
  manual: CloseoutManualEvidence
}

export interface CloseoutQueueJob {
  kind: CloseoutJobKind
  id: number
  slug: string | null
  code: string
  status: string
  completedAt: Date
  completedAtSource: CompletedAtSource
  ageDays: number
  ageBucket: CloseoutAgeBucketId
  customerName: string | null
  plateNumber: string | null
  vehicleLabel: string | null
  productName: string | null
  workOrderDocumentNo: string | null
  workOrderId: number | null
  c1: CloseoutCheckState
  c2: CloseoutCheckState
  c3: CloseoutCheckState
  c4: CloseoutCheckState
  c5: CloseoutCheckState
  c6: CloseoutCheckState
  /** C7/C8: selalu passed=null (manual) dengan detail bukti banding. */
  c7: CloseoutCheckState
  c8: CloseoutCheckState
  /** Hanya C1-C6 yang gagal (passed === false); C5 null tidak menahan. */
  blockers: string[]
  readyToClose: boolean
  qty: number | null
  completedQty: number | null
  totalActualCost: number | null
}

export interface CloseoutAgeBucket {
  id: CloseoutAgeBucketId
  label: string
  jobCount: number
  readyCount: number
}

export interface WorkshopCloseoutQueue {
  jobs: CloseoutQueueJob[]
  buckets: CloseoutAgeBucket[]
  totalJobs: number
  readyCount: number
  blockedCount: number
}

const DAY_MS = 86_400_000

export function closeoutAgeBucketForDays(ageDays: number): CloseoutAgeBucketId {
  if (ageDays <= 30) return "d0_30"
  if (ageDays <= 60) return "d31_60"
  if (ageDays <= 90) return "d61_90"
  return "over90"
}

function rp(amount: number): string {
  return `Rp${safeRound(amount, 2).toFixed(2)}`
}

function buildJob(input: CloseoutQueueJobInput, asOf: Date): CloseoutQueueJob {
  const completedAt = input.endDate ?? input.updatedAt
  const completedAtSource: CompletedAtSource = input.endDate ? "endDate" : "updatedAt"
  const ageDays = Math.max(0, Math.floor((asOf.getTime() - completedAt.getTime()) / DAY_MS))

  const c1: CloseoutCheckState =
    input.kind === "production_order"
      ? { passed: true, detail: "Tidak berlaku: perintah produksi tidak punya PO anak." }
      : input.openProductionOrderCount === 0
        ? { passed: true, detail: "Semua perintah produksi anak sudah completed/cancelled/closed." }
        : {
            passed: false,
            detail: input.firstOpenProductionOrder
              ? `Perintah produksi #${input.firstOpenProductionOrder.id} (${input.firstOpenProductionOrder.documentNo}) masih berstatus '${input.firstOpenProductionOrder.status}'.`
              : `${input.openProductionOrderCount} perintah produksi anak belum selesai.`,
          }

  const c2: CloseoutCheckState =
    input.kind === "production_order"
      ? { passed: true, detail: "Tidak berlaku: pengeluaran material diperiksa pada perintah kerja induk." }
      : input.openMaterialIssueCount === 0
        ? { passed: true, detail: "Tidak ada pengeluaran material draft/processing." }
        : {
            passed: false,
            detail: input.firstOpenMaterialIssue
              ? `Pengeluaran material #${input.firstOpenMaterialIssue.id} (${input.firstOpenMaterialIssue.documentNo}) masih berstatus '${input.firstOpenMaterialIssue.status}'.`
              : `${input.openMaterialIssueCount} pengeluaran material belum selesai.`,
          }

  const c3: CloseoutCheckState =
    input.unpostedCostCount === 0
      ? { passed: true, detail: "Semua biaya produksi sudah terposting." }
      : {
          passed: false,
          detail:
            input.firstUnpostedCostId != null
              ? `Biaya produksi #${input.firstUnpostedCostId} belum terposting (postedAt kosong).`
              : `${input.unpostedCostCount} biaya produksi belum terposting.`,
        }

  let c4: CloseoutCheckState
  if (input.kind === "production_order") {
    const qty = input.qty ?? 0
    const completedQty = input.completedQty ?? 0
    const sisa = safeRound(input.totalActualCost ?? 0, 2)
    if (completedQty < qty) {
      c4 = { passed: false, detail: `Belum selesai penuh: completedQty ${completedQty} dari qty ${qty}.` }
    } else if (sisa !== 0) {
      c4 = { passed: false, detail: `Sisa WIP totalActualCost ${rp(sisa)} belum nol.` }
    } else {
      c4 = { passed: true, detail: "Selesai penuh dan sisa WIP Rp0.00." }
    }
  } else if (input.childWipResidualCount === 0) {
    c4 = { passed: true, detail: "Tidak ada perintah produksi anak dengan sisa WIP." }
  } else {
    c4 = {
      passed: false,
      detail: input.firstChildWipResidual
        ? `Perintah produksi #${input.firstChildWipResidual.id} (${input.firstChildWipResidual.documentNo}) sisa WIP ${rp(input.firstChildWipResidual.totalActualCost)}.`
        : `${input.childWipResidualCount} perintah produksi anak bersisa WIP.`,
    }
  }

  const c5: CloseoutCheckState =
    input.qcBlocked == null
      ? { passed: null, detail: input.qcDetail }
      : input.qcBlocked
        ? { passed: false, detail: input.qcDetail }
        : { passed: true, detail: input.qcDetail }

  const c6: CloseoutCheckState = input.periodClosed
    ? {
        passed: false,
        detail: `Periode akuntansi sudah ditutup sampai ${input.periodLockDate ? formatDate(input.periodLockDate) : "-"}.`,
      }
    : { passed: true, detail: "Periode tanggal tutup terbuka." }

  const c7: CloseoutCheckState = { passed: null, detail: input.manual.c7Detail }
  const c8: CloseoutCheckState = { passed: null, detail: input.manual.c8Detail }

  const checks = [c1, c2, c3, c4, c5, c6]
  const blockers = checks.filter((c) => c.passed === false).map((c) => c.detail)

  return {
    kind: input.kind,
    id: input.id,
    slug: input.slug,
    code: input.documentNo,
    status: input.status,
    completedAt,
    completedAtSource,
    ageDays,
    ageBucket: closeoutAgeBucketForDays(ageDays),
    customerName: input.customerName,
    plateNumber: input.plateNumber,
    vehicleLabel: input.vehicleLabel,
    productName: input.productName,
    workOrderDocumentNo: input.workOrderDocumentNo,
    workOrderId: input.workOrderId,
    c1, c2, c3, c4, c5, c6, c7, c8,
    blockers,
    readyToClose: blockers.length === 0,
    qty: input.qty,
    completedQty: input.completedQty,
    totalActualCost: input.totalActualCost == null ? null : safeRound(input.totalActualCost, 2),
  }
}

export function buildWorkshopCloseoutQueue(input: {
  jobs: readonly CloseoutQueueJobInput[]
  asOf: Date
}): WorkshopCloseoutQueue {
  const jobs = input.jobs
    .filter((job) => job.status === "completed")
    .map((job) => buildJob(job, input.asOf))
  // Paling lama menunggu dulu; seri: WO sebelum PO, nomor dokumen, id.
  jobs.sort((a, b) => {
    if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays
    if (a.kind !== b.kind) return a.kind === "work_order" ? -1 : 1
    if (a.code !== b.code) return a.code < b.code ? -1 : 1
    return a.id - b.id
  })

  const buckets: CloseoutAgeBucket[] = WORKSHOP_CLOSEOUT_AGE_BUCKETS.map((bucket) => {
    const inBucket = jobs.filter((job) => job.ageBucket === bucket.id)
    return {
      id: bucket.id,
      label: bucket.label,
      jobCount: inBucket.length,
      readyCount: inBucket.filter((job) => job.readyToClose).length,
    }
  })

  return {
    jobs,
    buckets,
    totalJobs: jobs.length,
    readyCount: jobs.filter((job) => job.readyToClose).length,
    blockedCount: jobs.filter((job) => !job.readyToClose).length,
  }
}
