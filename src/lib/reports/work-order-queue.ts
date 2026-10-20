/**
 * Builder murni papan antrian bengkel (F-2026-10-20-28(a)).
 *
 * Kalender existing hanya menampilkan event keuangan; tidak ada daftar WO
 * aktif per tahap, umur job, atau bendera terlambat dari `endDate`. Builder
 * ini hanya membaca kolom existing `WorkOrder` (`startDate/endDate/status/
 * date`) — tanpa model Bay, tanpa teknisi, tanpa migrasi. Inti F-28(b)
 * (model Bay + penugasan teknisi + cek konflik) ditunda-teknis; papan
 * read-only ini default aktifnya.
 *
 * "Aktif" = draft/pending/in_progress, himpunan yang sama yang dipakai
 * transisi WO di manufacturing.actions.ts (start menerima draft/pending,
 * complete menerima pending/in_progress). Status final (completed/
 * cancelled/dll) tidak masuk antrian.
 *
 * Terlambat hanya bila `endDate` ADA dan hari kalendernya (WIB, TZ app)
 * sebelum hari ini. WO tanpa `endDate` tidak pernah dituduh terlambat —
 * tidak ada tenggat yang dilanggar — dan mengantre paling akhir dalam
 * tahapnya supaya yang bertenggat terlihat duluan.
 *
 * Umur job dihitung hari kalender sejak `startDate` (jatuh ke `date`
 * dokumen bila startDate kosong), dibatasi >= 0 untuk jam yang miring.
 */

export const ACTIVE_WORK_ORDER_STATUSES = ["draft", "pending", "in_progress"] as const

export interface WorkOrderQueueInput {
  id: number
  slug: string | null
  documentNo: string
  status: string
  date: Date
  startDate: Date | null
  endDate: Date | null
  customerName: string | null
  /** Telepon pelanggan untuk tombol WA manual; null bila tak tercatat. */
  customerPhone: string | null
  /** Label kendaraan (plat · model); null bila WO tanpa kendaraan. */
  vehicleLabel: string | null
  /** Plat kendaraan untuk isi pesan WA; null bila tanpa kendaraan/plat. */
  plateNumber: string | null
}

export interface WorkOrderQueueRow {
  id: number
  slug: string | null
  documentNo: string
  status: string
  customerName: string | null
  customerPhone: string | null
  vehicleLabel: string | null
  plateNumber: string | null
  startDate: Date | null
  endDate: Date | null
  /** Hari kalender sejak mulai (startDate ?? date), >= 0. */
  ageDays: number
  /** endDate ada dan hari kalendernya sebelum hari ini. */
  isOverdue: boolean
  /** Hari kalender lewat dari endDate; 0 bila tidak terlambat. */
  overdueDays: number
}

export interface WorkOrderQueue {
  rows: WorkOrderQueueRow[]
  totalActive: number
  overdueCount: number
  byStatus: Record<string, number>
}

const MS_PER_DAY = 86_400_000

/** Awal hari kalender lokal (app TZ=Asia/Jakarta) sebagai angka hari. */
function calendarDay(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY)
}

function compareRows(a: WorkOrderQueueRow, b: WorkOrderQueueRow): number {
  // Bertenggat dulu, tenggat terawal dulu; tanpa tenggat terakhir.
  const aEnd = a.endDate ? calendarDay(a.endDate) : Number.POSITIVE_INFINITY
  const bEnd = b.endDate ? calendarDay(b.endDate) : Number.POSITIVE_INFINITY
  if (aEnd !== bEnd) return aEnd - bEnd
  if (a.documentNo !== b.documentNo) return a.documentNo < b.documentNo ? -1 : 1
  return a.id - b.id
}

export function buildWorkOrderQueue(
  inputs: readonly WorkOrderQueueInput[],
  now: Date = new Date(),
): WorkOrderQueue {
  const today = calendarDay(now)
  const rows: WorkOrderQueueRow[] = []
  const byStatus: Record<string, number> = {}
  for (const input of inputs) {
    if (!(ACTIVE_WORK_ORDER_STATUSES as readonly string[]).includes(input.status)) continue
    const started = input.startDate ?? input.date
    const ageDays = Math.max(0, today - calendarDay(started))
    const endDay = input.endDate ? calendarDay(input.endDate) : null
    const overdueDays = endDay !== null && endDay < today ? today - endDay : 0
    rows.push({
      id: input.id,
      slug: input.slug,
      documentNo: input.documentNo,
      status: input.status,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      vehicleLabel: input.vehicleLabel,
      plateNumber: input.plateNumber,
      startDate: input.startDate,
      endDate: input.endDate,
      ageDays,
      isOverdue: overdueDays > 0,
      overdueDays,
    })
    byStatus[input.status] = (byStatus[input.status] ?? 0) + 1
  }
  rows.sort(compareRows)
  return {
    rows,
    totalActive: rows.length,
    overdueCount: rows.filter((r) => r.isOverdue).length,
    byStatus,
  }
}
