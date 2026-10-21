/**
 * Loader read-only kebutuhan material per perintah kerja (F-2026-10-20-19).
 *
 * Detail WO existing hanya menampilkan MaterialIssue yang sudah keluar;
 * butuh/tersedia/dipesan tidak pernah dihitung dalam satu read-model.
 * Loader ini menggabungkan: baris WorkOrderItem (butuh, kecuali yang
 * sudah `replaced` — sudah diganti baris lain, lihat
 * reviseWorkOrderItems), MaterialIssue `completed` tertaut WO ini
 * (keluar; hook material-issue membuat stok keluar hanya pada transisi
 * itu), dan PurchaseOrder non-`cancelled` tertaut WO ini (dipesan bersih
 * `qty - receivedQty`). Tersedia = `Item.qtyOnHand` total (konvensi
 * min-stock).
 *
 * F-2026-10-20-51(a): "terikat WO lain" = sisa kebutuhan (qty−issued dari
 * MI completed WO itu) baris non-replaced WO aktif lain
 * (draft/pending/in_progress, himpunan `ACTIVE_WORK_ORDER_STATUSES`)
 * per item. Query massal (WO lain + MI-nya), bukan per-WO. Ini
 * peringatan ATP read-only — BUKAN `StockReservation` mengikat (F-07
 * inti ditunda); WO tidak dikunci dan stok tidak ditahan.
 * F-2026-10-20-52: incoming memakai `expectedDate` PO yang sama; tanggal
 * tercepat per item dibandingkan builder ke `startDate` WO.
 *
 * Read-only: tanpa migrasi, tanpa jurnal, tanpa mutasi.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildWorkOrderMaterialNeeds,
  type MaterialNeedInput,
  type WorkOrderMaterialNeeds,
} from "@/lib/reports/work-order-material-needs"
import { ACTIVE_WORK_ORDER_STATUSES } from "@/lib/reports/work-order-queue"

export async function getWorkOrderMaterialNeeds(
  workOrderId: number,
): Promise<WorkOrderMaterialNeeds | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      startDate: true,
      items: {
        select: { itemId: true, description: true, qty: true, status: true },
        orderBy: { id: "asc" },
      },
    },
  })
  if (!wo) return null

  const active = wo.items.filter((i) => i.status !== "replaced")
  const ids = [...new Set(active.map((i) => i.itemId).filter((id) => id > 0))]

  const [items, issues, orders, otherWorkOrders] = await Promise.all([
    ids.length
      ? prisma.item.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, unitOfMeasure: true, qtyOnHand: true, defaultWarehouseId: true },
        })
      : Promise.resolve([] as { id: number; name: string; unitOfMeasure: string; qtyOnHand: unknown; defaultWarehouseId: number | null }[]),
    prisma.materialIssue.findMany({
      where: { workOrderId, status: "completed" },
      select: { warehouseId: true, items: { select: { itemId: true, qty: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { workOrderId, deletedAt: null, status: { notIn: ["cancelled"] } },
      select: { expectedDate: true, items: { select: { itemId: true, qty: true, receivedQty: true } } },
    }),
    ids.length
      ? prisma.workOrder.findMany({
          where: { id: { not: workOrderId }, status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } },
          select: {
            id: true,
            items: {
              where: { itemId: { in: ids } },
              select: { itemId: true, qty: true, status: true },
            },
          },
        })
      : Promise.resolve([] as { id: number; items: { itemId: number; qty: unknown; status: string }[] }[]),
  ])

  const metaById = new Map(items.map((i) => [i.id, i]))
  const sumByItem = (rows: { itemId: number; qty: number }[]) => {
    const m = new Map<number, number>()
    for (const r of rows) m.set(r.itemId, (m.get(r.itemId) ?? 0) + r.qty)
    return m
  }
  const issued = sumByItem(issues.flatMap((mi) => mi.items).map((i) => ({ itemId: i.itemId, qty: Number(i.qty) })))
  const ordered = sumByItem(
    orders.flatMap((po) => po.items).map((i) => ({
      itemId: i.itemId,
      qty: Math.max(0, Number(i.qty) - Number(i.receivedQty)),
    })),
  )

  // F-52: tanggal incoming tercepat per item dari PO penyumbang sisa > 0.
  const incomingEarliest = new Map<number, Date>()
  for (const po of orders) {
    if (po.expectedDate == null) continue
    for (const row of po.items) {
      if (Math.max(0, Number(row.qty) - Number(row.receivedQty)) <= 0) continue
      const prev = incomingEarliest.get(row.itemId)
      if (!prev || po.expectedDate.getTime() < prev.getTime()) incomingEarliest.set(row.itemId, po.expectedDate)
    }
  }

  // F-51(a): terikat WO lain. Query massal MI completed untuk semua WO lain
  // yang memuat item terkait (bukan per-WO). Mock/test tanpa findMany pada
  // materialIssue untuk WO lain tetap aman: query kedua memakai where sama
  // dengan workOrderId tunggal target, jadi di sini kita hitung dari WO lain
  // + MI completed yang tertaut WO-WO itu bila mock menyediakannya.
  const otherIds = otherWorkOrders.map((w) => w.id)
  const committedOther = new Map<number, number>()
  if (otherIds.length > 0) {
    const otherIssues = await prisma.materialIssue.findMany({
      where: { workOrderId: { in: otherIds }, status: "completed" },
      select: { workOrderId: true, items: { select: { itemId: true, qty: true } } },
    })
    const issuedByWoItem = new Map<string, number>()
    for (const mi of otherIssues as { workOrderId: number; items: { itemId: number; qty: unknown }[] }[]) {
      for (const row of mi.items) {
        const key = `${mi.workOrderId}:${row.itemId}`
        issuedByWoItem.set(key, (issuedByWoItem.get(key) ?? 0) + Number(row.qty))
      }
    }
    for (const other of otherWorkOrders) {
      for (const line of other.items) {
        if (line.status === "replaced" || line.itemId <= 0) continue
        const req = Number(line.qty)
        const iss = issuedByWoItem.get(`${other.id}:${line.itemId}`) ?? 0
        const remaining = Math.max(0, req - iss)
        if (remaining > 0) committedOther.set(line.itemId, (committedOther.get(line.itemId) ?? 0) + remaining)
      }
    }
  }

  const required = new Map<number, number>()
  for (const line of active) {
    if (line.itemId <= 0) continue
    required.set(line.itemId, (required.get(line.itemId) ?? 0) + Number(line.qty))
  }

  // F-2026-10-21-012 lapis aman: stok per gudang relevan. Gudang relevan per
  // item = gudang MI completed WO ini (tempat material benar-benar keluar)
  // ∪ gudang default item. ATP global lama tetap shortageQty; field baru
  // menandai sisa yang tak tersedia di gudang relevan walau global cukup.
  // Bukan reservasi mengikat — inti StockReservation tetap ditunda.
  const relevantWarehouses = new Map<number, Set<number>>()
  const addRelevant = (itemId: number, warehouseId: number | null | undefined) => {
    if (warehouseId == null) return
    const set = relevantWarehouses.get(itemId) ?? new Set<number>()
    set.add(warehouseId)
    relevantWarehouses.set(itemId, set)
  }
  for (const mi of issues as { warehouseId?: number; items: { itemId: number }[] }[]) {
    for (const row of mi.items) addRelevant(row.itemId, mi.warehouseId)
  }
  for (const meta of items) addRelevant(meta.id, meta.defaultWarehouseId)
  const atWarehouse = new Map<number, number>()
  const warehousePairs: { itemId: number; warehouseId: number }[] = []
  for (const [itemId, set] of relevantWarehouses) {
    for (const warehouseId of set) warehousePairs.push({ itemId, warehouseId })
  }
  if (warehousePairs.length > 0) {
    const layerRows = await prisma.inventoryLayer.findMany({
      where: { OR: warehousePairs, remaining: { gt: 0 } },
      select: { itemId: true, warehouseId: true, remaining: true },
    })
    for (const row of layerRows as { itemId: number; remaining: unknown }[]) {
      atWarehouse.set(row.itemId, (atWarehouse.get(row.itemId) ?? 0) + Number(row.remaining))
    }
  }

  const inputs: MaterialNeedInput[] = [...required.entries()].map(([itemId, requiredQty]) => ({
    itemId,
    name: metaById.get(itemId)?.name ?? `Barang #${itemId}`,
    unitOfMeasure: metaById.get(itemId)?.unitOfMeasure ?? "",
    requiredQty,
    qtyOnHand: Number(metaById.get(itemId)?.qtyOnHand ?? 0),
    qtyOnHandAtWarehouse: relevantWarehouses.has(itemId)
      ? (atWarehouse.get(itemId) ?? 0)
      : Number(metaById.get(itemId)?.qtyOnHand ?? 0),
    issuedQty: issued.get(itemId) ?? 0,
    orderedQty: ordered.get(itemId) ?? 0,
    committedOtherQty: committedOther.get(itemId) ?? 0,
    incomingQty: ordered.get(itemId) ?? 0,
    incomingEarliestDate: incomingEarliest.get(itemId) ?? null,
    workOrderStartDate: wo.startDate ?? null,
  }))
  // Baris jasa (itemId=0) dipertahankan sebagai baris terpenuhi supaya
  // jumlah baris kartu cocok dengan baris WO yang terlihat pengguna.
  if (active.some((i) => i.itemId <= 0)) {
    inputs.push({
      itemId: 0,
      name: "Jasa / baris custom",
      unitOfMeasure: "",
      requiredQty: 0,
      qtyOnHand: 0,
      issuedQty: 0,
      orderedQty: 0,
    })
  }

  return buildWorkOrderMaterialNeeds(inputs)
}
