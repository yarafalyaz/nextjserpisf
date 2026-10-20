/**
 * Builder murni status turunan part per baris perintah kerja
 * (F-2026-10-20-105, lapis aman backend).
 *
 * PUTUSAN manager 22:41: builder status turunan per baris WO dari dokumen
 * existing LANJUT; inti kolom status terkelola DITUNDA-teknis (default
 * WorkOrderItem.status string existing tetap). Builder ini TIDAK menulis
 * kolom status — ia menurunkan status tampil dari bukti dokumen:
 *
 * - `diganti`: baris berstatus stored `replaced` (reviseWorkOrderItems).
 * - `terpasang`: qty ter-issue (MaterialIssue completed) >= qty baris.
 * - `terpasang-sebagian`: 0 < issued < qty.
 * - `datang`: belum ter-issue, tetapi PO tertaut WO ini untuk item yang
 *   sama sudah diterima penuh (received >= ordered bersih per item).
 * - `dipesan`: PO terbuka (non-cancelled, sisa > 0) untuk item ini.
 * - `menunggu`: belum ada bukti dokumen apa pun.
 * - `tak-tertaut`: baris jasa/custom (itemId <= 0) — tak ada dokumen
 *   stok yang bisa diturunkan, jangan ditebak (pola F-97a).
 *
 * Precedence: diganti > terpasang(-sebagian) > datang > dipesan >
 * menunggu. Issue diatribusikan per workOrderItemId; baris issue legacy
 * tanpa tautan diatribusikan per itemId ke baris pertama yang cocok
 * (pola bom-revision-impact) agar qty ter-issue tidak overstated.
 * Retur pembelian tidak mengurangi issued: PurchaseReturnItem tak punya
 * tautan ke WO/baris WO (schema 1544-1555), jadi "dikembalikan" tidak
 * bisa dibuktikan per baris — ditandai di notice, bukan ditebak.
 */

export const WORK_ORDER_PART_STATUS_NOTICE =
  "Status turunan read-only dari dokumen existing (PO, penerimaan, " +
  "pengeluaran material completed). Retur pembelian tidak tertaut per " +
  "baris perintah kerja, jadi status dikembalikan tidak diturunkan di sini."

export type WorkOrderPartStatus =
  | "menunggu"
  | "dipesan"
  | "datang"
  | "terpasang-sebagian"
  | "terpasang"
  | "diganti"
  | "tak-tertaut"

export interface WorkOrderPartLineInput {
  id: number
  itemId: number
  description: string | null
  qty: number
  /** Status tersimpan existing (mis. pending/replaced). */
  storedStatus: string
}

export interface WorkOrderPartIssueInput {
  workOrderItemId: number | null
  itemId: number
  qty: number
}

export interface WorkOrderPartOrderInput {
  itemId: number
  /** qty PO non-cancelled tertaut WO ini. */
  orderedQty: number
  receivedQty: number
}

export interface WorkOrderPartStatusRow {
  workOrderItemId: number
  itemId: number
  description: string | null
  qty: number
  issuedQty: number
  orderedQty: number
  receivedQty: number
  status: WorkOrderPartStatus
}

export interface WorkOrderPartStatusReport {
  notice: string
  rows: WorkOrderPartStatusRow[]
  counts: Record<WorkOrderPartStatus, number>
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function buildWorkOrderPartStatus(input: {
  lines: readonly WorkOrderPartLineInput[]
  issues: readonly WorkOrderPartIssueInput[]
  orders: readonly WorkOrderPartOrderInput[]
}): WorkOrderPartStatusReport {
  const issuedByLine = new Map<number, number>()
  const legacyByItem = new Map<number, number>()
  for (const issue of input.issues) {
    if (issue.workOrderItemId != null) {
      issuedByLine.set(
        issue.workOrderItemId,
        round2((issuedByLine.get(issue.workOrderItemId) ?? 0) + issue.qty),
      )
    } else {
      legacyByItem.set(
        issue.itemId,
        round2((legacyByItem.get(issue.itemId) ?? 0) + issue.qty),
      )
    }
  }

  const orderByItem = new Map<number, { ordered: number; received: number }>()
  for (const order of input.orders) {
    const agg = orderByItem.get(order.itemId) ?? { ordered: 0, received: 0 }
    agg.ordered = round2(agg.ordered + order.orderedQty)
    agg.received = round2(agg.received + order.receivedQty)
    orderByItem.set(order.itemId, agg)
  }

  const counts: Record<WorkOrderPartStatus, number> = {
    menunggu: 0,
    dipesan: 0,
    datang: 0,
    "terpasang-sebagian": 0,
    terpasang: 0,
    diganti: 0,
    "tak-tertaut": 0,
  }

  const rows = input.lines.map((line) => {
    let issuedQty = issuedByLine.get(line.id) ?? 0
    const legacy = legacyByItem.get(line.itemId) ?? 0
    if (legacy > 0 && line.itemId > 0) {
      const take = Math.min(legacy, Math.max(line.qty - issuedQty, 0))
      issuedQty = round2(issuedQty + take)
      legacyByItem.set(line.itemId, round2(legacy - take))
    }
    const order = orderByItem.get(line.itemId) ?? { ordered: 0, received: 0 }

    let status: WorkOrderPartStatus
    if (line.storedStatus === "replaced") status = "diganti"
    else if (line.itemId <= 0) status = "tak-tertaut"
    else if (issuedQty >= line.qty && line.qty > 0) status = "terpasang"
    else if (issuedQty > 0) status = "terpasang-sebagian"
    else if (order.ordered > 0 && order.received >= order.ordered) status = "datang"
    else if (order.ordered > order.received) status = "dipesan"
    else status = "menunggu"
    counts[status] += 1

    return {
      workOrderItemId: line.id,
      itemId: line.itemId,
      description: line.description,
      qty: line.qty,
      issuedQty,
      orderedQty: order.ordered,
      receivedQty: order.received,
      status,
    }
  })

  return { notice: WORK_ORDER_PART_STATUS_NOTICE, rows, counts }
}
