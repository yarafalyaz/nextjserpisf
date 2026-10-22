/**
 * Loader read-only Permintaan Barang Antar Gudang — F-2026-10-22-078-S
 * inti (induk F-2026-10-21-014), spec BOT 5 §4/§5.
 *
 * Antrean per gudang:
 * - `incoming`: permintaan yang perlu ditindak gudang SUMBER
 *   (sourceWarehouseId dalam scope) — diajukan menunggu persetujuan,
 *   disetujui/terpenuhi_sebagian menunggu pemenuhan.
 * - `outgoing`: permintaan dari gudang TUJUAN (requesterWarehouseId
 *   dalam scope).
 * Scope fail-closed: kind `none` -> antrean kosong; baris di luar kedua
 * gudang pengguna tidak tampil (AC-MR-6 versi daftar; detail ditegakkan
 * assertMaterialRequestVisible di actions).
 *
 * Status tampil = kata verbatim builder (MATERIAL_REQUEST_STATUS_LABELS);
 * sisa per baris dari deriveMaterialRequestFulfillment atas transfer
 * received tertaut (BR-MR-04). Read-only: tanpa mutasi/stok/jurnal.
 */

import { prisma } from "@/lib/db/prisma"
import { getWarehouseScope, type WarehouseScope } from "@/lib/auth/warehouse-scope"
import {
  MATERIAL_REQUEST_STATUS_LABELS,
  deriveMaterialRequestFulfillment,
  type MaterialRequestStatus,
} from "./material-request"

export interface MaterialRequestQueueLine {
  itemId: number
  itemName: string
  itemSku: string | null
  unitOfMeasure: string
  requestedQty: number
  receivedQty: number
  remainingQty: number
  notes: string | null
}

export interface MaterialRequestQueueRow {
  id: number
  slug: string | null
  documentNo: string
  status: string
  statusLabel: string
  requesterWarehouseId: number
  requesterWarehouseName: string
  sourceWarehouseId: number
  sourceWarehouseName: string
  workOrderId: number | null
  workOrderDocumentNo: string | null
  neededBy: Date | null
  isOverdue: boolean
  createdBy: number | null
  createdAt: Date
  approvedBy: number | null
  approvedAt: Date | null
  rejectionReason: string | null
  lines: MaterialRequestQueueLine[]
  transferCount: number
  receivedTransferCount: number
}

export interface MaterialRequestQueue {
  incoming: MaterialRequestQueueRow[]
  outgoing: MaterialRequestQueueRow[]
}

interface QueueUser {
  id: string
  roles: string[]
}

function scopeWarehouseFilter(scope: WarehouseScope, field: string) {
  if (scope.kind === "all") return {}
  if (scope.kind === "none") return null
  return { [field]: { in: scope.warehouseIds } }
}

async function loadRows(where: Record<string, unknown>, now: Date): Promise<MaterialRequestQueueRow[]> {
  const requests = await prisma.materialRequest.findMany({
    where,
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      requesterWarehouseId: true,
      sourceWarehouseId: true,
      workOrderId: true,
      neededBy: true,
      createdBy: true,
      createdAt: true,
      approvedBy: true,
      approvedAt: true,
      rejectionReason: true,
      requesterWarehouse: { select: { name: true } },
      sourceWarehouse: { select: { name: true } },
      workOrder: { select: { documentNo: true } },
      items: {
        select: {
          itemId: true,
          qty: true,
          notes: true,
          item: { select: { name: true, sku: true, unitOfMeasure: true } },
        },
      },
      transfers: {
        select: {
          status: true,
          items: { select: { itemId: true, qty: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })

  return requests.map((r) => {
    const receivedLines = r.transfers
      .filter((t) => t.status === "received")
      .flatMap((t) => t.items.map((i) => ({ itemId: i.itemId, qty: Number(i.qty) })))
    const { lines } = deriveMaterialRequestFulfillment({
      requested: r.items.map((i) => ({ itemId: i.itemId, qty: Number(i.qty) })),
      receivedLines,
    })
    const fulfillmentByItem = new Map(lines.map((l) => [l.itemId, l]))
    return {
      id: r.id,
      slug: r.slug,
      documentNo: r.documentNo,
      status: r.status,
      statusLabel:
        MATERIAL_REQUEST_STATUS_LABELS[r.status as MaterialRequestStatus] ?? r.status,
      requesterWarehouseId: r.requesterWarehouseId,
      requesterWarehouseName: r.requesterWarehouse.name,
      sourceWarehouseId: r.sourceWarehouseId,
      sourceWarehouseName: r.sourceWarehouse.name,
      workOrderId: r.workOrderId,
      workOrderDocumentNo: r.workOrder?.documentNo ?? null,
      neededBy: r.neededBy,
      // neededBy lewat saat masih terbuka = terlambat tampil, bukan auto-tolak (spec §7).
      isOverdue:
        r.neededBy !== null &&
        r.neededBy.getTime() < now.getTime() &&
        (r.status === "diajukan" || r.status === "disetujui" || r.status === "terpenuhi_sebagian"),
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      approvedBy: r.approvedBy,
      approvedAt: r.approvedAt,
      rejectionReason: r.rejectionReason,
      lines: r.items.map((i) => {
        const f = fulfillmentByItem.get(i.itemId)
        return {
          itemId: i.itemId,
          itemName: i.item.name,
          itemSku: i.item.sku,
          unitOfMeasure: i.item.unitOfMeasure,
          requestedQty: Number(i.qty),
          receivedQty: f?.receivedQty ?? 0,
          remainingQty: f?.remainingQty ?? Number(i.qty),
          notes: i.notes,
        }
      }),
      transferCount: r.transfers.length,
      receivedTransferCount: r.transfers.filter((t) => t.status === "received").length,
    }
  })
}

export async function getMaterialRequestQueue(
  user: QueueUser,
  now: Date = new Date(),
): Promise<MaterialRequestQueue> {
  const scope = await getWarehouseScope(user)
  const incomingWhere = scopeWarehouseFilter(scope, "sourceWarehouseId")
  const outgoingWhere = scopeWarehouseFilter(scope, "requesterWarehouseId")
  if (incomingWhere === null || outgoingWhere === null) {
    return { incoming: [], outgoing: [] }
  }
  const [incoming, outgoing] = await Promise.all([
    loadRows(incomingWhere, now),
    loadRows(outgoingWhere, now),
  ])
  return { incoming, outgoing }
}

export async function getMaterialRequestByWorkOrder(
  workOrderId: number,
): Promise<MaterialRequestQueueRow[]> {
  if (!Number.isSafeInteger(workOrderId) || workOrderId <= 0) return []
  return loadRows({ workOrderId }, new Date())
}
