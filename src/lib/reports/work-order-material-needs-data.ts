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
 * Read-only: tanpa migrasi, tanpa jurnal, tanpa mutasi.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildWorkOrderMaterialNeeds,
  type MaterialNeedInput,
  type WorkOrderMaterialNeeds,
} from "@/lib/reports/work-order-material-needs"

export async function getWorkOrderMaterialNeeds(
  workOrderId: number,
): Promise<WorkOrderMaterialNeeds | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      items: {
        select: { itemId: true, description: true, qty: true, status: true },
        orderBy: { id: "asc" },
      },
    },
  })
  if (!wo) return null

  const active = wo.items.filter((i) => i.status !== "replaced")
  const ids = [...new Set(active.map((i) => i.itemId).filter((id) => id > 0))]

  const [items, issues, orders] = await Promise.all([
    ids.length
      ? prisma.item.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, unitOfMeasure: true, qtyOnHand: true },
        })
      : Promise.resolve([] as { id: number; name: string; unitOfMeasure: string; qtyOnHand: unknown }[]),
    prisma.materialIssue.findMany({
      where: { workOrderId, status: "completed" },
      select: { items: { select: { itemId: true, qty: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { workOrderId, deletedAt: null, status: { notIn: ["cancelled"] } },
      select: { items: { select: { itemId: true, qty: true, receivedQty: true } } },
    }),
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

  const required = new Map<number, number>()
  for (const line of active) {
    if (line.itemId <= 0) continue
    required.set(line.itemId, (required.get(line.itemId) ?? 0) + Number(line.qty))
  }

  const inputs: MaterialNeedInput[] = [...required.entries()].map(([itemId, requiredQty]) => ({
    itemId,
    name: metaById.get(itemId)?.name ?? `Barang #${itemId}`,
    unitOfMeasure: metaById.get(itemId)?.unitOfMeasure ?? "",
    requiredQty,
    qtyOnHand: Number(metaById.get(itemId)?.qtyOnHand ?? 0),
    issuedQty: issued.get(itemId) ?? 0,
    orderedQty: ordered.get(itemId) ?? 0,
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
