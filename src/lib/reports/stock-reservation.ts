/**
 * Perencana murni reservasi stok per WO/gudang (F-2026-10-21-012 inti,
 * spec F-2026-10-22-045-S §2/§5, vonis Lead F-045-S). Tanpa Prisma:
 * service stock-reservation.service.ts memberi fakta, modul ini memutus.
 *
 * Aturan yang dikunci di sini:
 * - BR-RES-02 gudang sumber: gudang MI WO → Item.defaultWarehouseId →
 *   null (baris tidak direservasi, penanda "gudang belum ditentukan").
 * - BR-RES-03 baris jasa itemId<=0 dan baris replaced tak pernah lahir.
 * - BR-RES-05/07 prioritas urutan start; kekurangan TIDAK memblokir:
 *   qtyReserved = min(sisa kebutuhan, tersedia sesudah reservasi aktif
 *   WO lain), shortageQty = selisihnya. Reservasi parsial (termasuk 0)
 *   tetap lahir sebagai baris active supaya penanda kekurangan §2(g)
 *   terbaca dari data, bukan ditebak UI.
 * - BR-RES-06 expiresAt = min(endDate, startDate + 14 hari); endDate
 *   kosong → startDate + 14 hari.
 * - BR-RES-08 konsumsi MI hanya menyentuh reservasi WO pemilik + gudang
 *   sama; kelebihan = keluar tanpa cadangan (overReservedQty), tidak
 *   pernah mengambil reservasi WO lain.
 * - Kata Indonesia §2(g) persis — BOT 2 memakai label ini verbatim.
 */

export const STOCK_RESERVATION_EXPIRY_DAYS = 14

export const RESERVATION_LABEL_ACTIVE = "Terreservasi"
export const RESERVATION_LABEL_CONSUMED = "Terpakai Habis"
export const RESERVATION_LABEL_RELEASED = "Dilepas"
export const RESERVATION_LABEL_EXPIRED =
  "Kedaluwarsa — reservasi ulang bila masih dibutuhkan"
export const RESERVATION_LABEL_NO_WAREHOUSE =
  "Belum direservasi — gudang belum ditentukan"
export const RESERVATION_LABEL_SHORTAGE_OTHER_WO =
  "Stok gudang ini sudah terreservasi untuk perintah kerja lain"
export const RESERVATION_LABEL_UNRESERVED_OUTFLOW = "Keluar tanpa cadangan reservasi"

const EPSILON = 1e-9

export type ReservationStatus = "active" | "consumed" | "released" | "expired"

export interface ReservationNeedLine {
  workOrderItemId: number
  itemId: number
  /** qty baris WO (non-replaced). */
  requiredQty: number
  /** qty MI completed tertaut baris ini (workOrderItemId). */
  issuedQty: number
  status: string
  defaultWarehouseId: number | null
}

export interface PlannedReservation {
  workOrderItemId: number
  itemId: number
  warehouseId: number
  qtyReserved: number
  shortageQty: number
  expiresAt: Date
}

export interface UnreservedLine {
  workOrderItemId: number
  itemId: number
  remainingQty: number
  label: string
}

export interface ReservationPlan {
  reservations: PlannedReservation[]
  unreserved: UnreservedLine[]
}

/** BR-RES-06: yang lebih awal antara endDate dan start + 14 hari. */
export function reservationExpiresAt(startDate: Date, endDate: Date | null): Date {
  const plusDays = new Date(startDate)
  plusDays.setDate(plusDays.getDate() + STOCK_RESERVATION_EXPIRY_DAYS)
  if (endDate && endDate.getTime() < plusDays.getTime()) return new Date(endDate)
  return plusDays
}

/** BR-RES-02 urutan putus gudang sumber satu baris. */
export function resolveReservationWarehouse(input: {
  materialIssueWarehouseId: number | null
  defaultWarehouseId: number | null
}): number | null {
  if (input.materialIssueWarehouseId != null) return input.materialIssueWarehouseId
  if (input.defaultWarehouseId != null) return input.defaultWarehouseId
  return null
}

export function planReservationsAtStart(input: {
  lines: ReservationNeedLine[]
  /** Gudang MI WO ini (satu MI per WO existing); null bila belum ada MI. */
  materialIssueWarehouseId: number | null
  /** Stok lapisan per (itemId, warehouseId). */
  onHandAt: (itemId: number, warehouseId: number) => number
  /** Sisa reservasi aktif WO LAIN per (itemId, warehouseId). */
  reservedByOthersAt: (itemId: number, warehouseId: number) => number
  startDate: Date
  endDate: Date | null
}): ReservationPlan {
  const expiresAt = reservationExpiresAt(input.startDate, input.endDate)
  const reservations: PlannedReservation[] = []
  const unreserved: UnreservedLine[] = []
  // Dua baris WO item sama + gudang sama berbagi ketersediaan dalam satu
  // rencana: kurangi jatah baris berikutnya dengan yang barusan direncanakan.
  const claimedInPlan = new Map<string, number>()

  for (const line of input.lines) {
    if (line.itemId <= 0 || line.status === "replaced") continue
    const remainingQty = Math.max(0, line.requiredQty - line.issuedQty)
    if (remainingQty <= EPSILON) continue
    const warehouseId = resolveReservationWarehouse({
      materialIssueWarehouseId: input.materialIssueWarehouseId,
      defaultWarehouseId: line.defaultWarehouseId,
    })
    if (warehouseId == null) {
      unreserved.push({
        workOrderItemId: line.workOrderItemId,
        itemId: line.itemId,
        remainingQty,
        label: RESERVATION_LABEL_NO_WAREHOUSE,
      })
      continue
    }
    const key = `${line.itemId}:${warehouseId}`
    const claimed = claimedInPlan.get(key) ?? 0
    const available =
      input.onHandAt(line.itemId, warehouseId) -
      input.reservedByOthersAt(line.itemId, warehouseId) -
      claimed
    const qtyReserved = Math.min(remainingQty, Math.max(0, available))
    claimedInPlan.set(key, claimed + qtyReserved)
    reservations.push({
      workOrderItemId: line.workOrderItemId,
      itemId: line.itemId,
      warehouseId,
      qtyReserved,
      shortageQty: Math.max(0, remainingQty - qtyReserved),
      expiresAt,
    })
  }
  return { reservations, unreserved }
}

export interface ConsumptionPlan {
  /** Qty yang menutup reservasi pemilik (0 bila tak ada reservasi cocok). */
  consumedFromReservation: number
  /** Kelebihan tanpa cadangan (BR-RES-08) — MI tetap jalan. */
  overReservedQty: number
  /** Status reservasi sesudah konsumsi; null = tak ada reservasi disentuh. */
  nextStatus: ReservationStatus | null
}

export function planReservationConsumption(input: {
  /** Sisa aktif reservasi WO pemilik di gudang MI; null = tanpa reservasi. */
  activeRemaining: number | null
  qty: number
}): ConsumptionPlan {
  const qty = Math.max(0, input.qty)
  if (input.activeRemaining == null) {
    return { consumedFromReservation: 0, overReservedQty: qty, nextStatus: null }
  }
  const consumed = Math.min(qty, Math.max(0, input.activeRemaining))
  const remainingAfter = input.activeRemaining - consumed
  return {
    consumedFromReservation: consumed,
    overReservedQty: Math.max(0, qty - consumed),
    nextStatus: remainingAfter <= EPSILON ? "consumed" : "active",
  }
}

/** Label Indonesia §2(g) untuk satu baris reservasi; null = bukan label reservasi. */
export function reservationStatusLabel(status: string): string | null {
  switch (status) {
    case "active":
      return RESERVATION_LABEL_ACTIVE
    case "consumed":
      return RESERVATION_LABEL_CONSUMED
    case "released":
      return RESERVATION_LABEL_RELEASED
    case "expired":
      return RESERVATION_LABEL_EXPIRED
    default:
      return null
  }
}
