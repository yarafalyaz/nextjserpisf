import { Prisma } from "@prisma/client"
import { resolveCostingMethodForItem } from "./costing-method.service"

type Tx = Prisma.TransactionClient

/** A batch lot that was actually decremented by `consumeFifoLayers`. */
export type ConsumedBatch = {
  batchNumber: string
  warehouseId: number | null
  qty: number
}

/** Cost consumed plus the lot/serial attribution needed to mirror the movement. */
export type FifoConsumption = {
  consumedCost: number
  shortfall: number
  /**
   * Serial numbers marked `used` by this call. Callers that MOVE stock instead
   * of selling it (e.g. a warehouse transfer) must re-activate these at the
   * destination, otherwise the units stay `used` forever and are unsellable.
   */
  consumedSerials: string[]
  /**
   * Batch lots actually decremented by this call. Callers that move stock must
   * re-create them in the destination warehouse to keep per-warehouse lot qty
   * and expiry reporting correct.
   */
  consumedBatches: ConsumedBatch[]
}

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
/**
 * F-2026-10-20-79: tanggal kalender dokumen untuk guard kedaluwarsa batch.
 * Dibandingkan per hari (bukan timestamp) agar batch yang kedaluwarsa tepat
 * pada tanggal dokumen masih lolos.
 */
export function toCalendarDate(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

/**
 * Urutan fisik FEFO untuk dekremen ItemBatch: expiryDate naik, lot tanpa
 * expiryDate terakhir. Hanya mengurutkan identitas lot fisik — biaya tetap
 * dari lapisan FIFO `consumeFifoLayers`, jangan disatukan jadi satu ORDER BY.
 */
export function compareBatchExpiry<T extends { expiryDate?: Date | null }>(a: T, b: T): number {
  const ea = a.expiryDate ? toCalendarDate(a.expiryDate).getTime() : Number.POSITIVE_INFINITY
  const eb = b.expiryDate ? toCalendarDate(b.expiryDate).getTime() : Number.POSITIVE_INFINITY
  return ea - eb
}

export async function consumeFifoLayers(
  tx: Tx,
  opts: {
    itemId: number
    warehouseId?: number | null
    qty: number
    label?: string
    allowShortfall?: boolean
    serialNumbers?: string[] | null
    /**
     * F-2026-10-20-79: tanggal dokumen. Bila diisi dan item memiliki baris
     * ItemBatch, lot kedaluwarsa (expiryDate < tanggal dokumen) ditolak dan
     * dekremen lot fisik urut FEFO. Opt-in: pemanggil tanpa tanggal dokumen
     * (sales/transfer/adjustment) mempertahankan perilaku lama persis.
     */
    documentDate?: Date | null
  }
): Promise<FifoConsumption> {
  const { itemId, warehouseId, qty, label, allowShortfall = false, serialNumbers, documentDate } = opts
  if (qty <= 0) {
    return { consumedCost: 0, shortfall: 0, consumedSerials: [], consumedBatches: [] }
  }

  // Locking read: fetch + lock candidate FIFO layers with FOR UPDATE so concurrent
  // stock-out for the same item serializes and reads the LATEST committed remaining
  // (a plain findMany would return a stale REPEATABLE-READ snapshot and oversell,
  // driving layer.remaining negative). Reading the columns from this locked query
  // also avoids the snapshot issue a subsequent plain read would hit.
  const whCond = warehouseId != null ? Prisma.sql`AND warehouse_id = ${warehouseId}` : Prisma.empty
  const layers = await tx.$queryRaw<{ id: number; remaining: unknown; unitCost: unknown; batchNumber: string | null; warehouseId: number | null }[]>(
    Prisma.sql`SELECT id, remaining, unit_cost AS unitCost, batch_number AS batchNumber, warehouse_id AS warehouseId
               FROM inventory_layers
               WHERE item_id = ${itemId} AND remaining > 0 ${whCond}
               ORDER BY created_at ASC, id ASC
               FOR UPDATE`
  )

  // Fetch effective costing method (category → item → company default → fifo).
  // Resolved through the shared service so receive and sell always agree.
  const item = await tx.item.findUnique({
    where: { id: itemId },
    select: {
      costingMethod: true,
      category: {
        select: {
          costingMethod: true
        }
      }
    }
  })
  // F-2026-10-20-79 (vonis accountant 19:23): guard kedaluwarsa + urutan FEFO
  // fisik hidup di SATU tempat untuk semua jalur konsumsi batch-tracked.
  // Biaya tetap FIFO (lapisan di atas, created_at ASC) dan TIDAK berubah.
  // Tanpa documentDate, pemanggil lama tak terpengaruh sama sekali.
  let physicalBatches: { id: number; batchNumber: string; qty: unknown; warehouseId: number; expiryDate: Date | null }[] | null = null
  if (documentDate) {
    const batchRows = await tx.itemBatch.findMany({
      where: { itemId, ...(warehouseId != null ? { warehouseId } : {}) },
      select: { id: true, batchNumber: true, qty: true, warehouseId: true, expiryDate: true },
    })
    if (batchRows.length > 0) {
      const docDay = toCalendarDate(documentDate)
      for (const b of batchRows) {
        // Lot qty=0 sudah habis fisik — kedaluwarsa lot kosong bukan alasan
        // menolak pengeluaran dari lot lain yang masih layak (F-011).
        if (Number(b.qty) <= 0) continue
        if (b.expiryDate && toCalendarDate(b.expiryDate).getTime() < docDay.getTime()) {
          throw new Error(
            `Batch ${b.batchNumber} untuk item #${itemId} sudah kedaluwarsa (${toCalendarDate(b.expiryDate).toISOString().slice(0, 10)}) sebelum tanggal dokumen (${docDay.toISOString().slice(0, 10)}); pengeluaran ditolak.`
          )
        }
      }
      // FEFO fisik: lot tercepat kedaluwarsa didekremen lebih dulu.
      physicalBatches = [...batchRows].sort((a, b) => compareBatchExpiry(a, b) || a.id - b.id)
    }
  }

  const costingMethod = await resolveCostingMethodForItem(item, tx)

  let averageCost = 0
  if (costingMethod === "average") {
    const totalValue = layers.reduce((s, l) => {
      const uCost = l.unitCost !== undefined ? l.unitCost : (l as any).unit_cost
      const rem = l.remaining !== undefined ? l.remaining : (l as any).remaining
      return s + Number(rem) * Number(uCost)
    }, 0)
    const totalQty = layers.reduce((s, l) => {
      const rem = l.remaining !== undefined ? l.remaining : (l as any).remaining
      return s + Number(rem)
    }, 0)
    averageCost = totalQty > 0 ? totalValue / totalQty : 0
  }

  // Shortfall guard computed from the locked (fresh) rows.
  if (!allowShortfall) {
    const available = layers.reduce((s, l) => {
      const rem = l.remaining !== undefined ? l.remaining : (l as any).remaining
      return s + Number(rem)
    }, 0)
    if (available < qty) {
      const where = warehouseId != null ? ` di gudang #${warehouseId}` : ""
      const ctx = label ? ` (${label})` : ""
      throw new Error(
        `Stok tidak mencukupi untuk item #${itemId}${where}${ctx}. Tersedia: ${available}, dibutuhkan: ${qty}.`
      )
    }
  }

  let consumedCost = 0
  const batchConsumption = new Map<string, number>()
  const layerUpdates: Promise<any>[] = []
  // Attribution of what this call actually took, for callers that move (not sell)
  // the stock and must mirror the lots/serials into another warehouse.
  const consumedBatches: ConsumedBatch[] = []
  const consumedSerials: string[] = []

  const layerRem = (l: (typeof layers)[number]): number =>
    Number(l.remaining !== undefined ? l.remaining : (l as unknown as { remaining: unknown }).remaining)
  const totalRemaining = layers.reduce((s, l) => s + layerRem(l), 0)
  const consumedQtyTarget = Math.min(qty, totalRemaining)

  // Per-layer consumption amounts. FIFO drains oldest first. AVERAGE drains
  // every layer in proportion to its remaining qty: the weighted average of
  // what is left must be identical before and after the sale, otherwise the
  // next sale is valued at a drifted average (10@4 + 30@6, jual 20 lalu 10:
  // FIFO drain menyisakan 20@6 sehingga penjualan kedua terhitung Rp60,
  // padahal rata-rata tertimbang yang benar tetap 5,5 → Rp55).
  const consumptions: { layer: (typeof layers)[number]; consume: number }[] = []
  if (costingMethod === "average" && totalRemaining > 0 && consumedQtyTarget > 0) {
    let allocated = 0
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]
      const rem = layerRem(layer)
      let share =
        i === layers.length - 1
          ? consumedQtyTarget - allocated
          : Math.round(((consumedQtyTarget * rem) / totalRemaining) * 100) / 100
      share = Math.round(Math.min(Math.max(share, 0), rem) * 100) / 100
      consumptions.push({ layer, consume: share })
      allocated = Math.round((allocated + share) * 100) / 100
    }
    // Rounding to cents can leave a small drift against the target; settle it
    // on the layers with the most spare capacity (or the largest shares when
    // removing) so the drained total is exact.
    let drift = Math.round((consumedQtyTarget - allocated) * 100) / 100
    if (drift !== 0) {
      const byCapacity = [...consumptions].sort(
        (a, b) => layerRem(b.layer) - b.consume - (layerRem(a.layer) - a.consume),
      )
      for (const entry of byCapacity) {
        if (drift === 0) break
        const capacity = drift > 0 ? layerRem(entry.layer) - entry.consume : entry.consume
        const adj = drift > 0 ? Math.min(drift, capacity) : Math.max(drift, -capacity)
        if (adj === 0) continue
        entry.consume = Math.round((entry.consume + adj) * 100) / 100
        drift = Math.round((drift - adj) * 100) / 100
      }
    }
  } else {
    let remainingToDrain = consumedQtyTarget
    for (const layer of layers) {
      if (remainingToDrain <= 0) break
      const consume = Math.min(layerRem(layer), remainingToDrain)
      if (consume > 0) consumptions.push({ layer, consume })
      remainingToDrain = Math.round((remainingToDrain - consume) * 100) / 100
    }
  }

  let consumedQtyActual = 0
  for (const { layer, consume } of consumptions) {
    if (consume <= 0) continue
    consumedQtyActual = Math.round((consumedQtyActual + consume) * 100) / 100
    if (costingMethod === "fifo") {
      const uCost = layer.unitCost !== undefined ? layer.unitCost : (layer as any).unit_cost
      // Round each layer's contribution to 2dp before accumulating so float drift
      // (0.1+0.2 style) never leaks into COGS / stock-move cost. The running sum
      // stays re-rounded too, so the total is exact to the cent.
      consumedCost = Math.round((consumedCost + Math.round(consume * Number(uCost) * 100) / 100) * 100) / 100
    }
    layerUpdates.push(
      tx.inventoryLayer.update({
        where: { id: layer.id },
        data: { qtyOut: { increment: consume }, remaining: { decrement: consume } },
      })
    )
    if (layer.batchNumber) {
      // Key by batchNumber|warehouseId to prevent double-decrement when warehouseId is null
      const key = `${layer.batchNumber}|${layer.warehouseId ?? ""}`
      batchConsumption.set(key, (batchConsumption.get(key) ?? 0) + consume)
    }
  }
  const toConsume = Math.round((qty - consumedQtyActual) * 100) / 100

  if (costingMethod === "average") {
    consumedCost = Math.round(consumedQtyActual * averageCost * 100) / 100
  }

  await Promise.all(layerUpdates)

  // Keep batch lots and serials in sync for tracked items.
  const consumedQty = qty - Math.max(0, toConsume)
  if (consumedQty > 0) {
    // Decrement matching batch lots by the consumed amount.
    if (batchConsumption.size > 0) {
      // Hoist the batch lookup to O(1) before the loop
      const uniqueBatchNumbers = Array.from(batchConsumption.keys()).map(k => k.split("|")[0])
      const fetchedBatches = await tx.itemBatch.findMany({
        where: {
          itemId,
          batchNumber: { in: uniqueBatchNumbers },
          // Filter by warehouse in memory since the IN clause covers all batches
        }
      })
      // FEFO fisik (documentDate): pakai daftar batch yang sudah dimuat+diurut
      // di awal panggilan ini. Tanpa documentDate: presisi lapisan FIFO lama.
      const batchesData =
        physicalBatches ??
        (fetchedBatches as unknown as { id: number; batchNumber: string; qty: unknown; warehouseId: number; expiryDate: Date | null }[])

      if (typeof tx.$executeRaw === "function" && batchesData.length > 0) {
        for (const batch of batchesData) {
          await tx.$executeRaw`SELECT id FROM item_batches WHERE id = ${batch.id} FOR UPDATE`
        }
      }
      
      const batchUpdates: Promise<any>[] = []
      // Dedup Sonar: satu helper dekremen lot untuk kedua jalur (FEFO fisik
      // dan presisi lapisan) — sebelumnya dua blok update identik.
      const decrementBatch = (
        batch: { id: number; batchNumber: string; warehouseId: number },
        deduct: number
      ) => {
        batchUpdates.push(
          tx.itemBatch.update({
            where: { id: batch.id },
            data: { qty: { decrement: deduct } },
          })
        )
        consumedBatches.push({
          batchNumber: batch.batchNumber,
          warehouseId: batch.warehouseId,
          qty: Math.round(deduct * 100) / 100,
        })
      }

      if (physicalBatches) {
        // FEFO fisik: total yang dikonsumsi lapisan FIFO didekremen dari lot
        // dengan expiry tercepat lebih dulu, tanpa expiry terakhir. Jumlah
        // dekremen persis consumedQty; consumedBatches mencerminkan lot
        // fisik ini agar telusur garansi (F-39) menunjuk lot yang benar-benar
        // keluar. Biaya sudah dihitung dari lapisan FIFO di atas.
        let remainingToDecrement = consumedQty
        for (const batch of batchesData) {
          if (remainingToDecrement <= 0) break
          if (Number(batch.qty) <= 0) continue
          // Gudang baris lapisan sudah dibatasi query lapisan; di sini cukup
          // hormati gudang yang diminta pemanggil.
          if (warehouseId != null && batch.warehouseId !== warehouseId) continue
          const deduct = Math.min(remainingToDecrement, Number(batch.qty))
          if (deduct > 0) {
            decrementBatch(batch, deduct)
            remainingToDecrement = Math.round((remainingToDecrement - deduct) * 100) / 100
          }
        }
      } else {
        for (const [key, qtyOut] of batchConsumption.entries()) {
          const [batchNumber, whId] = key.split("|")
          const batchWarehouseId = whId ? Number.parseInt(whId, 10) : null

          const batches = batchesData.filter(b =>
            b.batchNumber === batchNumber &&
            (batchWarehouseId != null ? b.warehouseId === batchWarehouseId : true)
          )

          let remainingToDecrement = qtyOut
          for (const batch of batches) {
            if (remainingToDecrement <= 0) break
            const deduct = Math.min(remainingToDecrement, Number(batch.qty))
            if (deduct > 0) {
              // Record only what was ACTUALLY decremented (a missing/undersized lot
              // row leaves part of qtyOut undecremented); reporting qtyOut here would
              // make a transfer re-create stock that was never removed at the source.
              decrementBatch({ ...batch, batchNumber }, deduct)
              remainingToDecrement -= deduct
            }
          }
        }
      }
      if (batchUpdates.length > 0) {
        await Promise.all(batchUpdates)
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
          select: { id: true, serialNumber: true },
        })
        if (found.length !== picked.length) {
          throw new Error(`Sebagian nomor seri tidak tersedia/sudah terpakai untuk item #${itemId}.`)
        }
        await tx.itemSerial.updateMany({ where: { id: { in: found.map((s) => s.id) } }, data: { status: "used" } })
        consumedSerials.push(...found.map((s) => s.serialNumber))
      } else {
        // Auto FIFO: mark the oldest available serials.
        const need = Math.round(consumedQty)
        if (need > 0) {
          const serials = await tx.itemSerial.findMany({
            where: { itemId, status: "available", ...(warehouseId != null ? { warehouseId } : {}) },
            orderBy: { createdAt: "asc" },
            take: need,
            select: { id: true, serialNumber: true },
          })
          if (serials.length !== need) {
            throw new Error(
              `Nomor seri tidak mencukupi untuk item #${itemId}. Tersedia: ${serials.length}, dibutuhkan: ${need}.`,
            )
          }
          await tx.itemSerial.updateMany({
            where: { id: { in: serials.map((s) => s.id) }, status: "available" },
            data: { status: "used" },
          })
          consumedSerials.push(...serials.map((s) => s.serialNumber))
        }
      }
    }
  }

  return {
    consumedCost,
    shortfall: Math.max(0, toConsume),
    consumedSerials,
    consumedBatches,
  }
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
