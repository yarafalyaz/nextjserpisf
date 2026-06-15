/* eslint-disable @typescript-eslint/no-explicit-any */

import { PrismaClient, Prisma, StockMove } from '@prisma/client'
import { notificationService } from './notification.service'
import { safeAdd, safeSubtract, safeMultiply, safeDivide } from '@/lib/utils/math'

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export class InventoryService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Post a stock move — creates inventory layers (IN) or consumes FIFO layers (OUT).
   * Uses Serializable isolation to prevent race conditions.
   *
   * If `tx` is provided, the work runs in that transaction (used when callers
   * already hold a project/document lock and need posting to share the same
   * transaction context — otherwise the uncommitted move would be invisible
   * to the inner transaction opened on a different connection).
   */
  async postMove(moveId: number, tx?: TxClient): Promise<void> {
    const run = async (t: TxClient): Promise<void> => {
      const move = await t.stockMove.findUniqueOrThrow({
        where: { id: moveId },
      })

      if (move.status === 'posted') {
        throw new Error(`Stock move ${move.documentNo} is already posted.`)
      }

      if (move.impact === 'IN') {
        await this.handleIn(t, move)
      } else if (move.impact === 'OUT') {
        await this.handleOut(t, move)
      } else {
        throw new Error(`Unknown impact type: ${move.impact}`)
      }

      await t.stockMove.update({
        where: { id: moveId },
        data: { status: 'posted' },
      })
    }

    if (tx) {
      await run(tx)
    } else {
      await this.prisma.$transaction(
        async (t) => {
          await run(t)
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      )
    }
  }

  /**
   * Handle incoming stock — creates a new inventory layer and increments qty_on_hand.
   */
  private async handleIn(tx: TxClient, move: StockMove): Promise<void> {
    // Create inventory layer for FIFO tracking (scoped to the move's warehouse)
    await tx.inventoryLayer.create({
      data: {
        itemId: move.itemId,
        warehouseId: move.warehouseId ?? null,
        stockMoveId: move.id,
        qtyIn: move.qty,
        qtyOut: 0,
        remaining: move.qty,
        unitCost: move.cost,
      },
    })

    // Atomic increment on item quantity
    await tx.$executeRaw`
      UPDATE items SET qty_on_hand = qty_on_hand + ${move.qty}
      WHERE id = ${move.itemId}
    `
  }

  /**
   * Handle outgoing stock — FIFO consumption with row-level locking.
   * Validates sufficient stock before consuming layers oldest-first.
   */
  private async handleOut(tx: TxClient, move: StockMove): Promise<void> {
    // Lock item row to prevent concurrent modifications
    const [item] = await tx.$queryRaw<any[]>`
      SELECT * FROM items WHERE id = ${move.itemId} FOR UPDATE
    `

    if (!item) {
      throw new Error(`Item not found: ${move.itemId}`)
    }

    if (item.qty_on_hand < Number(move.qty)) {
      throw new Error(
        `Stok tidak mencukupi untuk item ${item.sku}. Tersedia: ${item.qty_on_hand}, Dibutuhkan: ${move.qty}`
      )
    }

    // FIFO consumption — lock layers ordered by creation date, scoped to the
    // move's warehouse so stock physically in another warehouse is never drawn.
    const layers = move.warehouseId != null
      ? await tx.$queryRaw<any[]>`
          SELECT * FROM inventory_layers
          WHERE item_id = ${move.itemId} AND warehouse_id = ${move.warehouseId} AND remaining > 0
          ORDER BY created_at ASC, id ASC
          FOR UPDATE
        `
      : await tx.$queryRaw<any[]>`
          SELECT * FROM inventory_layers
          WHERE item_id = ${move.itemId} AND remaining > 0
          ORDER BY created_at ASC, id ASC
          FOR UPDATE
        `

    let qtyToConsume = Number(move.qty)
    let totalCost = 0

    for (const layer of layers) {
      if (qtyToConsume <= 0) break

      const consume = Math.min(Number(layer.remaining), qtyToConsume)

      await tx.inventoryLayer.update({
        where: { id: layer.id },
        data: {
          qtyOut: { increment: consume },
          remaining: { decrement: consume },
        },
      })

      totalCost = safeAdd(totalCost, safeMultiply(consume, Number(layer.unit_cost), 0), 0)
      qtyToConsume = safeSubtract(qtyToConsume, consume, 2)
    }

    // qtyToConsume is now rounded to 2 decimal places (the DB column scale). This
    // absorbs the float subtraction drift (e.g. 0.4 - 0.3 - 0.1 yields 2.77e-17
    // in plain JS, which would otherwise falsely trip the "Kurang" branch below
    // and reject a perfectly balanced FIFO draw against Decimal(15,2) layers).
    if (qtyToConsume > 0) {
      const where = move.warehouseId != null ? ` di gudang #${move.warehouseId}` : ''
      throw new Error(`Stok tidak mencukupi untuk item ${item.sku}${where}. Kurang ${qtyToConsume}.`)
    }

    // Update cost on move (weighted average from consumed layers)
    const unitCost = safeDivide(totalCost, Number(move.qty), 0)
    await tx.stockMove.update({
      where: { id: move.id },
      data: { cost: unitCost },
    })

    // Atomic decrement with guard against negative stock
    const result = await tx.$executeRaw`
      UPDATE items SET qty_on_hand = qty_on_hand - ${move.qty}
      WHERE id = ${move.itemId} AND qty_on_hand >= ${move.qty}
    `

    if (result === 0) {
      throw new Error('Concurrent stock modification detected. Please retry.')
    }

    // Check low stock threshold and notify asynchronously
        const updatedItem = await tx.item.findUnique({ where: { id: move.itemId } })
    if (
      updatedItem &&
      Number(updatedItem.minStock) > 0 &&
      Number(updatedItem.qtyOnHand) <= Number(updatedItem.minStock)
    ) {
      setTimeout(() => notificationService.checkAndNotifyLowStock(updatedItem as any), 0)
    }
  }

  /**
   * Reverse a posted stock move by creating an opposite move and posting it.
   * IN becomes OUT, OUT becomes IN.
   */
  async reverseMove(moveId: number): Promise<number> {
    return await this.prisma.$transaction(
      async (tx) => {
        const original = await tx.stockMove.findUniqueOrThrow({
          where: { id: moveId },
        })

        if (original.status !== 'posted') {
          throw new Error(
            `Cannot reverse move ${original.documentNo}: status is ${original.status}, expected "posted".`
          )
        }

        const reverseImpact = original.impact === 'IN' ? 'OUT' : 'IN'

        // Create the reversal move
        const reversal = await tx.stockMove.create({
          data: {
            documentNo: `REV-${original.documentNo}`,
            itemId: original.itemId,
            qty: original.qty,
            cost: original.cost,
            impact: reverseImpact,
            status: 'draft',
            referenceType: original.referenceType,
            referenceId: original.referenceId,
            warehouseId: original.warehouseId,
            notes: `Reversal of ${original.documentNo}`,
          },
        })

        // Mark original as reversed
        await tx.stockMove.update({
          where: { id: moveId },
          data: { status: 'reversed' },
        })

        return reversal.id
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )
  }
}

// Singleton instance
import { prisma } from '@/lib/db/prisma'
export const inventoryService = new InventoryService(prisma)

/**
 * Batch issue all project materials as Stock Move OUT.
 * Creates one stock move per project item and posts them.
 * Wrapped in a transaction with project row lock to prevent double-submit.
 */
export async function issueProjectMaterials(
  projectId: number,
  warehouseId: number
): Promise<number[]> {
  const { generateDocumentNumberBatch } = await import('@/lib/utils/document-number')

  return await prisma.$transaction(async (tx) => {
    // Lock the project row to prevent concurrent material issue
    await tx.$executeRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`

    const project = await tx.project.findUnique({
      where: { id: projectId },
      include: { items: true },
    })
    if (!project) throw new Error('Project not found')

    const validItems = project.items.filter((pi) => pi.itemId != null)
    if (validItems.length === 0) return []

    // Idempotency: fetch all existing moves for this project in one query
    const existingMoves = await tx.stockMove.findMany({
      where: {
        referenceType: 'project_material_issue',
        referenceId: projectId,
        itemId: { in: validItems.map((pi) => pi.itemId!) },
      },
      select: { id: true, itemId: true },
    })
    const existingMovesByItem = new Map(existingMoves.map((m) => [m.itemId, m.id]))

    const itemsToIssue = validItems.filter((pi) => !existingMovesByItem.has(pi.itemId!))

    let smDocNos: string[] = []
    if (itemsToIssue.length > 0) {
      smDocNos = await generateDocumentNumberBatch("SM", itemsToIssue.length)
    }

    const results: number[] = existingMoves.map((m) => m.id)

    // We still have to loop for the moves because `postMove` must run serially 
    // to maintain FIFO/qty invariants within the same transaction.
    // However, we eliminated the N+1 on `findFirst` and `generateDocumentNumber`.
    for (let i = 0; i < itemsToIssue.length; i++) {
      const pi = itemsToIssue[i]
      const documentNo = smDocNos[i]

      const move = await tx.stockMove.create({
        data: {
          documentNo,
          itemId: pi.itemId!,
          warehouseId,
          qty: Number(pi.qty),
          cost: 0,
          impact: 'OUT',
          status: 'draft',
          referenceType: 'project_material_issue',
          referenceId: projectId,
          notes: `Material Issue - Project #${projectId} - Item #${pi.itemId}`,
        },
      })

      await inventoryService.postMove(move.id, tx)
      results.push(move.id)
    }

    return results
  })
}
