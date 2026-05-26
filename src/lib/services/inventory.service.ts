
import { PrismaClient, Prisma, StockMove } from '@prisma/client'
import { notificationService } from './notification.service'

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export class InventoryService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Post a stock move — creates inventory layers (IN) or consumes FIFO layers (OUT).
   * Uses Serializable isolation to prevent race conditions.
   */
  async postMove(moveId: number): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const move = await tx.stockMove.findUniqueOrThrow({
          where: { id: moveId },
        })

        if (move.status === 'posted') {
          throw new Error(`Stock move ${move.documentNo} is already posted.`)
        }

        if (move.impact === 'IN') {
          await this.handleIn(tx, move)
        } else if (move.impact === 'OUT') {
          await this.handleOut(tx, move)
        } else {
          throw new Error(`Unknown impact type: ${move.impact}`)
        }

        await tx.stockMove.update({
          where: { id: moveId },
          data: { status: 'posted' },
        })
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )
  }

  /**
   * Handle incoming stock — creates a new inventory layer and increments qty_on_hand.
   */
  private async handleIn(tx: TxClient, move: StockMove): Promise<void> {
    // Create inventory layer for FIFO tracking
    await tx.inventoryLayer.create({
      data: {
        itemId: move.itemId,
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

    // FIFO consumption — lock layers ordered by creation date
    const layers = await tx.$queryRaw<any[]>`
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

      totalCost += consume * Number(layer.unit_cost)
      qtyToConsume -= consume
    }

    if (qtyToConsume > 0) {
      throw new Error('Inkonsistensi data: layer FIFO tidak mencukupi.')
    }

    // Update cost on move (weighted average from consumed layers)
    const unitCost = totalCost / Number(move.qty)
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
 */
export async function issueProjectMaterials(
  projectId: number,
  warehouseId: number
): Promise<number[]> {
  const { generateDocumentNumber } = await import('@/lib/utils/document-number')

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { items: true },
  })
  if (!project) throw new Error('Project not found')

  const results: number[] = []

  for (const pi of project.items) {
    if (!pi.itemId) continue
    const documentNo = await generateDocumentNumber('SM')

    const move = await prisma.stockMove.create({
      data: {
        documentNo,
        itemId: pi.itemId,
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

    // Post the move (FIFO consumption + qty update)
    await inventoryService.postMove(move.id)
    results.push(move.id)
  }

  return results
}
