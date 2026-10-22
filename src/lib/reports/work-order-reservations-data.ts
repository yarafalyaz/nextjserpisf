/**
 * Loader read-only tabel reservasi detail WO (F-2026-10-22-057-S §2/§3,
 * spec BOT 5 PR #442). Bukti primer rilis = baris StockReservation itu
 * sendiri (status + releasedAt + releasedBy + releaseReason); loader ini
 * passthrough baris itu — TIDAK menghitung ulang status/sisa dari MI atau
 * lapisan. releasedBy ditampilkan sebagai nama pengguna (resolusi ID→nama
 * §3), releaseReason apa adanya (tidak diterjemahkan ulang).
 *
 * Lazy-expire sama seperti loader kebutuhan material: baris aktif WO ini
 * yang lewat expiresAt → expired saat dibaca (idempoten, kegagalan expire
 * tidak menggagalkan baca). Gerbang view_work_orders di page existing;
 * Q-RIL-1 (getWarehouseScope per gudang) menunggu vonis Lead — loader ini
 * tidak menyaring per gudang.
 */

import { prisma } from "@/lib/db/prisma"
import { expireOverdueReservationsTx } from "@/lib/services/stock-reservation.service"
import { planReservationsAtStart } from "@/lib/reports/stock-reservation"
import {
  buildWorkOrderReservationRow,
  buildUnreservedNeedRow,
  type WorkOrderReservationRow,
  type UnreservedNeedRow,
} from "@/lib/reports/stock-reservation-release"

export interface WorkOrderReservations {
  rows: WorkOrderReservationRow[]
  /** Baris kebutuhan tanpa reservasi (gudang belum ditentukan) — bukan rilis. */
  unreserved: UnreservedNeedRow[]
}

export async function getWorkOrderReservations(
  workOrderId: number,
): Promise<WorkOrderReservations | null> {
  try {
    await prisma.$transaction(async (tx) => {
      await expireOverdueReservationsTx(tx, { workOrderId })
    })
  } catch (e) {
    console.error("[work-order-reservations] lazy-expire reservasi gagal", e)
  }

  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true },
  })
  if (!wo) return null

  const reservations = await prisma.stockReservation.findMany({
    where: { workOrderId },
    select: {
      id: true,
      itemId: true,
      warehouseId: true,
      workOrderItemId: true,
      qtyReserved: true,
      qtyConsumed: true,
      status: true,
      expiresAt: true,
      releasedAt: true,
      releasedBy: true,
      releaseReason: true,
    },
    orderBy: { id: "asc" },
  })

  const itemIds = [...new Set(reservations.map((r) => r.itemId))]
  const warehouseIds = [...new Set(reservations.map((r) => r.warehouseId))]
  const userIds = [
    ...new Set(
      reservations
        .map((r) => r.releasedBy)
        .filter((v): v is number => v != null),
    ),
  ]
  const [items, warehouses, users] = await Promise.all([
    itemIds.length
      ? prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: number; name: string }[]),
    warehouseIds.length
      ? prisma.warehouse.findMany({
          where: { id: { in: warehouseIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: number; name: string }[]),
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: number; name: string }[]),
  ])
  const itemName = new Map(items.map((i) => [i.id, i.name]))
  const warehouseName = new Map(warehouses.map((w) => [w.id, w.name]))
  const userName = new Map(users.map((u) => [u.id, u.name]))

  const rows = reservations.map((r) =>
    buildWorkOrderReservationRow({
      id: r.id,
      itemName: itemName.get(r.itemId) ?? `Barang #${r.itemId}`,
      warehouseName: warehouseName.get(r.warehouseId) ?? `Gudang #${r.warehouseId}`,
      qtyReserved: Number(r.qtyReserved),
      qtyConsumed: Number(r.qtyConsumed),
      status: r.status,
      expiresAt: r.expiresAt,
      releasedAt: r.releasedAt,
      releasedByName: r.releasedBy != null ? (userName.get(r.releasedBy) ?? null) : null,
      releaseReason: r.releaseReason,
    }),
  )

  // §2: baris kebutuhan yang tak pernah lahir sebagai reservasi karena
  // gudang belum ditentukan. Dihitung dari rencana murni yang sama dengan
  // jalur lahir (planReservationsAtStart) atas fakta WO saat ini — hanya
  // baris `unreserved` yang dipakai; baris ini bukan released dan tidak
  // terhitung peristiwa rilis mana pun.
  const unreserved = await loadUnreservedNeeds(workOrderId, reservations)

  return { rows, unreserved }
}

async function loadUnreservedNeeds(
  workOrderId: number,
  reservations: { workOrderItemId: number | null }[],
): Promise<UnreservedNeedRow[]> {
  const reservedLineIds = new Set(
    reservations
      .map((r) => r.workOrderItemId)
      .filter((v): v is number => v != null),
  )
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      startDate: true,
      endDate: true,
      items: {
        select: { id: true, itemId: true, qty: true, status: true },
        orderBy: { id: "asc" },
      },
    },
  })
  if (!wo) return []

  const itemIds = [...new Set(wo.items.map((i) => i.itemId).filter((id) => id > 0))]
  const [mi, items, issuedItems] = await Promise.all([
    prisma.materialIssue.findFirst({
      where: { workOrderId },
      select: { warehouseId: true },
      orderBy: { id: "asc" },
    }),
    itemIds.length
      ? prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, defaultWarehouseId: true },
        })
      : Promise.resolve(
          [] as { id: number; name: string; defaultWarehouseId: number | null }[],
        ),
    prisma.materialIssueItem.findMany({
      where: {
        materialIssue: { workOrderId, status: "completed" },
        workOrderItemId: { not: null },
      },
      select: { workOrderItemId: true, qty: true },
    }),
  ])
  const metaById = new Map(items.map((i) => [i.id, i]))
  const issuedByLine = new Map<number, number>()
  for (const row of issuedItems) {
    if (row.workOrderItemId == null) continue
    issuedByLine.set(
      row.workOrderItemId,
      (issuedByLine.get(row.workOrderItemId) ?? 0) + Number(row.qty),
    )
  }

  const plan = planReservationsAtStart({
    lines: wo.items.map((i) => ({
      workOrderItemId: i.id,
      itemId: i.itemId,
      requiredQty: Number(i.qty),
      issuedQty: issuedByLine.get(i.id) ?? 0,
      status: i.status,
      defaultWarehouseId: metaById.get(i.itemId)?.defaultWarehouseId ?? null,
    })),
    materialIssueWarehouseId: mi?.warehouseId ?? null,
    // Hanya cabang gudang-null yang dipakai; stok tak memengaruhi unreserved.
    onHandAt: () => 0,
    reservedByOthersAt: () => 0,
    startDate: wo.startDate ?? new Date(),
    endDate: wo.endDate,
  })

  return plan.unreserved
    .filter((u) => !reservedLineIds.has(u.workOrderItemId))
    .map((u) =>
      buildUnreservedNeedRow({
        itemName: metaById.get(u.itemId)?.name ?? `Barang #${u.itemId}`,
        remainingQty: u.remainingQty,
      }),
    )
}
