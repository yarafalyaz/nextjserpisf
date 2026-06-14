import { Prisma } from "@prisma/client"

type Tx = Prisma.TransactionClient

/**
 * Per-warehouse FIFO inventory helpers.
 *
 * Stock is tracked per (item, warehouse): InventoryLayer.warehouseId scopes each
 * layer to the warehouse it physically lives in. Consumption only draws from
 * layers in the requested warehouse, so a transfer/issue/sale from warehouse A
 * can never silently consume stock that is physically in warehouse B.
 *
 * Item.qtyOnHand remains the GLOBAL on-hand total (sum across warehouses) and is
 * kept in sync by the callers (+/- qty). Per-warehouse availability is derived
 * from the sum of remaining layer quantities for that (item, warehouse).
 */

/** Sum of remaining FIFO quantity for an item, optionally scoped to a warehouse. */
export async function availableQty(
  tx: Tx,
  itemId: number,
  warehouseId?: number | null
): Promise<number> {
  const agg = await tx.inventoryLayer.aggregate({
    where: {
      itemId,
      remaining: { gt: 0 },
      ...(warehouseId != null ? { warehouseId } : {}),
    },
    _sum: { remaining: true },
  })
  return Number(agg._sum.remaining ?? 0)
}

/**
 * Consume `qty` from the oldest FIFO layers for an item in a given warehouse.
 * Returns the total cost consumed (for COGS / cost-basis carry-over).
 *
 * - When `warehouseId` is provided, only layers in that warehouse are consumed
 *   and availability is checked per-warehouse.
 * - When `warehouseId` is null/undefined, layers are consumed across all
 *   warehouses (legacy / untracked items without a default warehouse).
 * - Throws if there is not enough stock, unless `allowShortfall` is true.
 */
export async function consumeFifoLayers(
  tx: Tx,
  opts: {
    itemId: number
    warehouseId?: number | null
    qty: number
    label?: string
    allowShortfall?: boolean
    serialNumbers?: string[] | null
  }
): Promise<{ consumedCost: number; shortfall: number }> {
  const { itemId, warehouseId, qty, label, allowShortfall = false, serialNumbers } = opts
  if (qty <= 0) return { consumedCost: 0, shortfall: 0 }

  // Locking read: fetch + lock candidate FIFO layers with FOR UPDATE so concurrent
  // stock-out for the same item serializes and reads the LATEST committed remaining
  // (a plain findMany would return a stale REPEATABLE-READ snapshot and oversell,
  // driving layer.remaining negative). Reading the columns from this locked query
  // also avoids the snapshot issue a subsequent plain read would hit.
  const whCond = warehouseId != null ? Prisma.sql`AND warehouse_id = ${warehouseId}` : Prisma.empty
  const layers = await tx.$queryRaw<{ id: number; remaining: unknown; unitCost: unknown; batchNumber: string | null }[]>(
    Prisma.sql`SELECT id, remaining, unit_cost AS unitCost, batch_number AS batchNumber
               FROM inventory_layers
               WHERE item_id = ${itemId} AND remaining > 0 ${whCond}
               ORDER BY created_at ASC, id ASC
               FOR UPDATE`
  )

  // Shortfall guard computed from the locked (fresh) rows.
  if (!allowShortfall) {
    const available = layers.reduce((s, l) => s + Number(l.remaining), 0)
    if (available < qty) {
      const where = warehouseId != null ? ` di gudang #${warehouseId}` : ""
      const ctx = label ? ` (${label})` : ""
      throw new Error(
        `Stok tidak mencukupi untuk item #${itemId}${where}${ctx}. Tersedia: ${available}, dibutuhkan: ${qty}.`
      )
    }
  }

  let toConsume = qty
  let consumedCost = 0
  const batchConsumption = new Map<string, number>()
  for (const layer of layers) {
    if (toConsume <= 0) break
    const consume = Math.min(Number(layer.remaining), toConsume)
    consumedCost += consume * Number(layer.unitCost)
    await tx.inventoryLayer.update({
      where: { id: layer.id },
      data: { qtyOut: { increment: consume }, remaining: { decrement: consume } },
    })
    if (layer.batchNumber) {
      batchConsumption.set(layer.batchNumber, (batchConsumption.get(layer.batchNumber) ?? 0) + consume)
    }
    toConsume -= consume
  }

  // Keep batch lots and serials in sync for tracked items.
  const consumedQty = qty - Math.max(0, toConsume)
  if (consumedQty > 0) {
    // Decrement matching batch lots by the consumed amount.
    if (batchConsumption.size > 0) {
      const batchNumbers = [...batchConsumption.keys()]
      const batches = await tx.itemBatch.findMany({
        where: { itemId, batchNumber: { in: batchNumbers }, ...(warehouseId != null ? { warehouseId } : {}) },
      })
      for (const batch of batches) {
        const qtyOut = batchConsumption.get(batch.batchNumber) ?? 0
        if (qtyOut > 0) {
          await tx.itemBatch.update({
            where: { id: batch.id },
            data: { qty: { decrement: Math.min(qtyOut, Number(batch.qty)) } },
          })
        }
      }
    }
    // Mark serials as used for serial-tracked items.
    const trackInfo = await tx.item.findUnique({ where: { id: itemId }, select: { trackSerial: true } })
    if (trackInfo?.trackSerial) {
      const picked = (serialNumbers ?? []).map((s) => String(s).trim()).filter((s) => s.length > 0)
      if (picked.length > 0) {
        // Manual selection: mark exactly the chosen serials (must be available).
        const need = Math.round(consumedQty)
        if (picked.length !== need) {
          throw new Error(`Jumlah nomor seri yang dipilih (${picked.length}) tidak sesuai dengan kuantitas yang dikeluarkan (${need}).`)
        }
        
        const uniquePicked = new Set(picked)
        if (uniquePicked.size !== picked.length) {
          throw new Error(`Terdapat duplikasi pada nomor seri yang diinput.`)
        }

        const found = await tx.itemSerial.findMany({
          where: { itemId, serialNumber: { in: picked }, status: "available", ...(warehouseId != null ? { warehouseId } : {}) },
          select: { id: true },
        })
        if (found.length !== picked.length) {
          throw new Error(`Sebagian nomor seri tidak tersedia/sudah terpakai untuk item #${itemId}.`)
        }
        await tx.itemSerial.updateMany({ where: { id: { in: found.map((s) => s.id) } }, data: { status: "used" } })
      } else {
        // Auto FIFO: mark the oldest available serials.
        const need = Math.round(consumedQty)
        if (need > 0) {
          const serials = await tx.itemSerial.findMany({
            where: { itemId, status: "available", ...(warehouseId != null ? { warehouseId } : {}) },
            orderBy: { createdAt: "asc" },
            take: need,
            select: { id: true },
          })
          if (serials.length > 0) {
            await tx.itemSerial.updateMany({
              where: { id: { in: serials.map((s) => s.id) } },
              data: { status: "used" },
            })
          }
        }
      }
    }
  }

  return { consumedCost, shortfall: Math.max(0, toConsume) }
}

/** Create an inbound FIFO layer scoped to a warehouse (and optional batch). */
export async function createInLayer(
  tx: Tx,
  opts: { itemId: number; warehouseId?: number | null; batchNumber?: string | null; stockMoveId: number; qty: number; unitCost: number }
): Promise<void> {
  await tx.inventoryLayer.create({
    data: {
      itemId: opts.itemId,
      warehouseId: opts.warehouseId ?? null,
      batchNumber: opts.batchNumber ?? null,
      stockMoveId: opts.stockMoveId,
      qtyIn: opts.qty,
      qtyOut: 0,
      remaining: opts.qty,
      unitCost: opts.unitCost,
    },
  })
}
