/**
 * Service inti StockReservation (F-2026-10-21-012, spec
 * F-2026-10-22-045-S, vonis Lead F-045-S). Semua fungsi menerima tx
 * pemanggil — reservasi lahir/lepas SELALU satu transaksi dengan peristiwa
 * pemicunya (klaim start, MI completed, complete/close/cancel WO), jadi
 * rollback pemicu ikut menggulung reservasi (AC-RES-4).
 *
 * Idempotensi aktif per (workOrderId, itemId, warehouseId): MySQL tak
 * punya unique parsial, jadi penjaga = cek baris aktif di dalam tx yang
 * sama. Jalur lahir hanya dari pemenang klaim start (updateMany
 * kondisional), jalur lain memperbarui baris aktif yang ada — tak ada
 * jalur kedua yang bisa melahirkan duplikat untuk WO yang sama.
 */
import { Prisma } from "@prisma/client"
import { availableQtyBatch } from "@/lib/services/inventory-fifo"
import {
  planReservationsAtStart,
  planReservationConsumption,
  type ReservationNeedLine,
} from "@/lib/reports/stock-reservation"

type Tx = Prisma.TransactionClient

function dec(value: number | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

/** Lahir di start (BR-RES-01/02/03/05/07). Panggil HANYA sesudah klaim menang. */
export async function createReservationsForWorkOrderStartTx(
  tx: Tx,
  input: { workOrderId: number; createdBy?: number | null },
): Promise<{ created: number; unreservedItemIds: number[] }> {
  const wo = await tx.workOrder.findUniqueOrThrow({
    where: { id: input.workOrderId },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      items: {
        select: { id: true, itemId: true, qty: true, status: true },
        orderBy: { id: "asc" },
      },
    },
  })

  const stockLines = wo.items.filter((i) => i.itemId > 0 && i.status !== "replaced")
  const itemIds = [...new Set(stockLines.map((i) => i.itemId))].sort((a, b) => a - b)

  // Serialisasi antar-WO: klaim start hanya menserialkan WO yang sama, jadi
  // dua start WO berbeda untuk item yang sama bisa membaca reservasi aktif
  // satu sama lain sebagai kosong dan over-reserve (2×80 atas on-hand 100).
  // Kunci baris items terurut (pola material-issue/goods-receipt) menahan
  // start lawan sampai tx ini commit; kunci items TIDAK menyegarkan snapshot
  // REPEATABLE READ, jadi reservasi aktif lawan dibaca ulang sebagai
  // LOCKING READ sesudahnya (baris yang ter-commit sebelum kunci terlihat).
  for (const itemId of itemIds) {
    await tx.$queryRaw`SELECT id FROM items WHERE id = ${itemId} FOR UPDATE`
  }
  const [mi, items, issuedItems, otherActive, existingActive] = await Promise.all([
    tx.materialIssue.findFirst({
      where: { workOrderId: wo.id },
      select: { warehouseId: true },
      orderBy: { id: "asc" },
    }),
    itemIds.length
      ? tx.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, defaultWarehouseId: true },
        })
      : Promise.resolve([] as { id: number; defaultWarehouseId: number | null }[]),
    tx.materialIssueItem.findMany({
      where: {
        materialIssue: { workOrderId: wo.id, status: "completed" },
        workOrderItemId: { not: null },
      },
      select: { workOrderItemId: true, qty: true },
    }),
    itemIds.length
      ? tx.stockReservation.findMany({
          where: {
            itemId: { in: itemIds },
            status: "active",
            workOrderId: { not: wo.id },
          },
          select: { itemId: true, warehouseId: true, qtyReserved: true, qtyConsumed: true },
        })
      : Promise.resolve(
          [] as { itemId: number; warehouseId: number; qtyReserved: Prisma.Decimal; qtyConsumed: Prisma.Decimal }[],
        ),
    tx.stockReservation.findMany({
      where: { workOrderId: wo.id, status: "active" },
      select: { itemId: true, warehouseId: true },
    }),
  ])

  const defaultWarehouseByItem = new Map(items.map((i) => [i.id, i.defaultWarehouseId]))
  const issuedByLine = new Map<number, number>()
  for (const row of issuedItems) {
    if (row.workOrderItemId == null) continue
    issuedByLine.set(row.workOrderItemId, (issuedByLine.get(row.workOrderItemId) ?? 0) + Number(row.qty))
  }
  const reservedByOthers = new Map<string, number>()
  // Fresh locking re-read: ganti snapshot basi dengan baris ter-commit
  // terkini. Update (consume/release oleh tx lain) sesudah bacaan ini tetap
  // lolos — accepted: planReservationsAtStart membuka shortage, bukan
  // menolak, jadi dampaknya hanya shortage lebih besar, bukan over-reserve.
  if (itemIds.length) {
    await tx.$executeRaw`SELECT id FROM stock_reservations WHERE item_id IN (${Prisma.join(itemIds)}) AND status = 'active' ORDER BY item_id, id FOR UPDATE`
    const freshOthers = await tx.stockReservation.findMany({
      where: {
        itemId: { in: itemIds },
        status: "active",
        workOrderId: { not: wo.id },
      },
      select: { itemId: true, warehouseId: true, qtyReserved: true, qtyConsumed: true },
    })
    for (const row of freshOthers) {
      const key = `${row.itemId}:${row.warehouseId}`
      reservedByOthers.set(
        key,
        (reservedByOthers.get(key) ?? 0) + Math.max(0, Number(row.qtyReserved) - Number(row.qtyConsumed)),
      )
    }
  } else {
    for (const row of otherActive) {
      const key = `${row.itemId}:${row.warehouseId}`
      reservedByOthers.set(
        key,
        (reservedByOthers.get(key) ?? 0) + Math.max(0, Number(row.qtyReserved) - Number(row.qtyConsumed)),
      )
    }
  }
  const warehouses = new Set<number>()
  for (const line of stockLines) {
    const wh = mi?.warehouseId ?? defaultWarehouseByItem.get(line.itemId) ?? null
    if (wh != null) warehouses.add(wh)
  }
  // BUGHUNT round3 MEDIUM: satu groupBy batch untuk semua pasangan
  // gudang×item (sebelumnya aggregate serial N+1 per pasangan dalam tx klaim).
  // Pasangan tanpa lapisan positif absen dari map → onHandAt membaca 0, persis
  // perilaku availableQty per pasangan.
  const onHand = await availableQtyBatch(
    tx,
    [...warehouses].flatMap((warehouseId) => itemIds.map((itemId) => ({ itemId, warehouseId }))),
  )

  const lines: ReservationNeedLine[] = wo.items.map((i) => ({
    workOrderItemId: i.id,
    itemId: i.itemId,
    requiredQty: Number(i.qty),
    issuedQty: issuedByLine.get(i.id) ?? 0,
    status: i.status,
    defaultWarehouseId: defaultWarehouseByItem.get(i.itemId) ?? null,
  }))

  const plan = planReservationsAtStart({
    lines,
    materialIssueWarehouseId: mi?.warehouseId ?? null,
    onHandAt: (itemId, warehouseId) => onHand.get(`${itemId}:${warehouseId}`) ?? 0,
    reservedByOthersAt: (itemId, warehouseId) =>
      reservedByOthers.get(`${itemId}:${warehouseId}`) ?? 0,
    startDate: wo.startDate ?? new Date(),
    endDate: wo.endDate,
  })

  const existingKeys = new Set(existingActive.map((r) => `${r.itemId}:${r.warehouseId}`))
  let created = 0
  for (const planned of plan.reservations) {
    const key = `${planned.itemId}:${planned.warehouseId}`
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    await tx.stockReservation.create({
      data: {
        workOrderId: wo.id,
        workOrderItemId: planned.workOrderItemId,
        itemId: planned.itemId,
        warehouseId: planned.warehouseId,
        qtyReserved: new Prisma.Decimal(planned.qtyReserved),
        qtyConsumed: new Prisma.Decimal(0),
        shortageQty: new Prisma.Decimal(planned.shortageQty),
        status: "active",
        expiresAt: planned.expiresAt,
        createdBy: input.createdBy ?? null,
      },
    })
    created++
  }
  return { created, unreservedItemIds: plan.unreserved.map((u) => u.itemId) }
}

/**
 * Konsumsi dari hook MI completed (BR-RES-08): hanya reservasi aktif WO
 * pemilik di gudang MI. Reservasi WO lain tak pernah disentuh. Return
 * qty tanpa cadangan per itemId supaya pemanggil bisa mencatatnya.
 */
export async function consumeReservationsForMaterialIssueTx(
  tx: Tx,
  input: {
    workOrderId: number | null
    warehouseId: number
    items: { itemId: number; qty: number | Prisma.Decimal }[]
  },
): Promise<Map<number, number>> {
  const unreservedOutflow = new Map<number, number>()
  if (input.workOrderId == null) {
    for (const item of input.items) {
      unreservedOutflow.set(item.itemId, (unreservedOutflow.get(item.itemId) ?? 0) + Number(item.qty))
    }
    return unreservedOutflow
  }
  for (const item of input.items) {
    const qty = Number(item.qty)
    if (qty <= 0) continue
    // Dua MI berbeda untuk WO yang sama terserialisasi oleh klaim per dokumen
    // saja, bukan per WO: kunci baris reservasi aktif SEBELUM dibaca, agar
    // qtyConsumed dinilai dari versi terbaru dan tidak tertimpa absolut oleh
    // penyelesaian MI konkuren (cadangan hidup lagi, stok tercatat dobel).
    await tx.$queryRaw`SELECT id FROM stock_reservations WHERE work_order_id = ${input.workOrderId} AND item_id = ${item.itemId} AND warehouse_id = ${input.warehouseId} AND status = 'active' ORDER BY id FOR UPDATE`
    // STOK-07: konsumsi SEMUA reservasi aktif item+gudang ini berurutan
    // (WO multi-baris material sama melahirkan beberapa reservasi).
    // findFirst tunggal menyisakan reservasi kedua aktif selamanya dan
    // sisa qty tercatat unreserved walau masih ada cadangan.
    const reservations = await tx.stockReservation.findMany({
      where: {
        workOrderId: input.workOrderId,
        itemId: item.itemId,
        warehouseId: input.warehouseId,
        status: "active",
      },
      orderBy: { id: "asc" },
    })
    let outstanding = qty
    for (const reservation of reservations) {
      if (outstanding <= 0) break
      const remaining = Number(reservation.qtyReserved) - Number(reservation.qtyConsumed)
      const plan = planReservationConsumption({ activeRemaining: remaining, qty: outstanding })
      if (plan.consumedFromReservation > 0) {
        const nextConsumed = dec(reservation.qtyConsumed).plus(plan.consumedFromReservation)
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: {
            qtyConsumed: nextConsumed,
            status: plan.nextStatus ?? reservation.status,
          },
        })
      }
      outstanding = plan.overReservedQty
    }
    if (outstanding > 0) {
      unreservedOutflow.set(
        item.itemId,
        (unreservedOutflow.get(item.itemId) ?? 0) + outstanding,
      )
    }
  }
  return unreservedOutflow
}

/** Lepas semua sisa aktif satu WO (complete/close/cancel, BR-RES-10). */
export async function releaseActiveReservationsForWorkOrderTx(
  tx: Tx,
  input: {
    workOrderId: number
    releasedBy?: number | null
    reason: string
  },
): Promise<number> {
  const result = await tx.stockReservation.updateMany({
    where: { workOrderId: input.workOrderId, status: "active" },
    data: {
      status: "released",
      releasedAt: new Date(),
      releasedBy: input.releasedBy ?? null,
      releaseReason: input.reason,
    },
  })
  return result.count
}

/** Lepas manual satu baris aktif (BR-RES-09; izin+alasan dijaga action). */
export async function releaseStockReservationTx(
  tx: Tx,
  input: { reservationId: number; releasedBy: number; reason: string },
): Promise<boolean> {
  const result = await tx.stockReservation.updateMany({
    where: { id: input.reservationId, status: "active" },
    data: {
      status: "released",
      releasedAt: new Date(),
      releasedBy: input.releasedBy,
      releaseReason: input.reason,
    },
  })
  return result.count > 0
}

/** AC-RES-8: baris WO diganti → sisa aktif baris itu released. */
export async function releaseReservationsForReplacedItemsTx(
  tx: Tx,
  input: { workOrderId: number; workOrderItemIds: number[]; releasedBy?: number | null },
): Promise<number> {
  if (input.workOrderItemIds.length === 0) return 0
  const result = await tx.stockReservation.updateMany({
    where: {
      workOrderId: input.workOrderId,
      workOrderItemId: { in: input.workOrderItemIds },
      status: "active",
    },
    data: {
      status: "released",
      releasedAt: new Date(),
      releasedBy: input.releasedBy ?? null,
      releaseReason: "Baris perintah kerja diganti (revisi item)",
    },
  })
  return result.count
}

/**
 * Perkecil sisa aktif satu baris WO ke kebutuhan baru (change order `ubah`
 * turun): qtyReserved turun sampai qtyConsumed + sisa kebutuhan; yang sudah
 * consumed tak disentuh. Baris habis terpakai → consumed; belum terpakai
 * sama sekali dan kebutuhan 0 → released. Kenaikan qty no-op (reservasi
 * baru hanya lahir di start). Return jumlah baris diubah.
 */
export async function reduceReservationsForWorkOrderItemTx(
  tx: Tx,
  input: {
    workOrderId: number
    workOrderItemId: number
    newQty: number | Prisma.Decimal
    releasedBy?: number | null
  },
): Promise<number> {
  const rows = await tx.stockReservation.findMany({
    where: {
      workOrderId: input.workOrderId,
      workOrderItemId: input.workOrderItemId,
      status: "active",
    },
    select: { id: true, qtyReserved: true, qtyConsumed: true },
    orderBy: { id: "asc" },
  })
  if (rows.length === 0) return 0
  const totalConsumed = rows.reduce((sum, r) => sum + Number(r.qtyConsumed), 0)
  let allowance = Math.max(0, Number(input.newQty) - totalConsumed)
  let changed = 0
  for (const row of rows) {
    const consumed = Number(row.qtyConsumed)
    const remaining = Number(row.qtyReserved) - consumed
    const keep = Math.min(remaining, allowance)
    allowance -= keep
    if (keep >= remaining) continue
    if (keep <= 0 && consumed <= 0) {
      await tx.stockReservation.update({
        where: { id: row.id },
        data: {
          status: "released",
          releasedAt: new Date(),
          releasedBy: input.releasedBy ?? null,
          releaseReason: "Baris perintah kerja diperkecil lewat change order",
        },
      })
    } else if (keep <= 0) {
      await tx.stockReservation.update({
        where: { id: row.id },
        data: { qtyReserved: dec(row.qtyConsumed), status: "consumed" },
      })
    } else {
      await tx.stockReservation.update({
        where: { id: row.id },
        data: { qtyReserved: dec(consumed).plus(keep) },
      })
    }
    changed++
  }
  return changed
}

/**
 * Lazy-expire (BR-RES-06, S5): baris aktif lewat expiresAt → expired.
 * Idempoten: updateMany kondisional status active; panggilan ulang no-op.
 * Return jumlah baris yang baru kedaluwarsa pada panggilan ini.
 */
export async function expireOverdueReservationsTx(
  tx: Tx,
  input: { workOrderId?: number; now?: Date } = {},
): Promise<number> {
  const now = input.now ?? new Date()
  const result = await tx.stockReservation.updateMany({
    where: {
      status: "active",
      expiresAt: { not: null, lt: now },
      ...(input.workOrderId != null ? { workOrderId: input.workOrderId } : {}),
    },
    data: { status: "expired" },
  })
  return result.count
}
