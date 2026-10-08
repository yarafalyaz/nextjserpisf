import { prisma, TxClient } from "@/lib/db/prisma"
import { safeAdd, safeSubtract, safeMultiply } from "@/lib/utils/math"
import { stockJournalService } from "@/lib/services/stock-journal.service"

/**
 * Non-material production cost rollup (PRD FAB-06/07/08/09).
 *
 * `ProductionOrder.totalActualCost` starts as the sum of issued material cost
 * (`issueMaterial`). Non-material cost lines (`ProductionCost`: labor, machine,
 * overhead, subcontract, service) are additive on top of that. This module
 * keeps the two in sync without ever double-counting: the material portion is
 * never recomputed here, only the non-material delta is applied.
 */

/**
 * Apply a non-material cost delta to a production order's actual cost. Positive
 * delta on add, negative on delete/update-reduction. Never lets the running
 * total go below zero (a cost line can't push HPP negative).
 *
 * The order row is locked (`SELECT ... FOR UPDATE`) before the read-modify-write
 * so a concurrent `issueMaterial` (which uses the same lock) cannot interleave
 * and drop one side's cost — the two write the same `total_actual_cost` column.
 */
export async function applyProductionCostDelta(
  productionOrderId: number,
  delta: number,
  client: TxClient | typeof prisma = prisma,
  actor?: { userId?: number; costLineId?: number },
): Promise<void> {
  if (delta === 0) return
  await client.$queryRaw`SELECT id FROM production_orders WHERE id = ${productionOrderId} FOR UPDATE`
  const order = await client.productionOrder.findUnique({
    where: { id: productionOrderId },
    select: { totalActualCost: true, documentNo: true },
  })
  if (!order) return
  const previous = Number(order.totalActualCost)
  const next = Math.max(0, safeAdd(previous, delta, 2))
  await client.productionOrder.update({
    where: { id: productionOrderId },
    data: { totalActualCost: next },
  })
  // Non-material cost must be DEBITED to WIP too, or the finished-goods receipt
  // credits WIP by the full actual cost while only the material portion was ever
  // debited — leaving WIP negative per job. Journal the EFFECTIVE change (the
  // clamp above can absorb part of a negative delta) so the GL mirrors the rollup.
  const effective = safeSubtract(next, previous, 2)
  if (effective !== 0 && client !== prisma) {
    await stockJournalService.onProductionCostAbsorbed(
      client as TxClient,
      effective,
      order.documentNo ?? `PO-${productionOrderId}`,
      actor?.costLineId ?? productionOrderId,
      actor?.userId,
    )
  }
}

/** Categories that are genuinely non-material (i.e. belong in ProductionCost). */
export const NON_MATERIAL_CATEGORIES = [
  "labor",
  "machine",
  "overhead",
  "subcontract",
  "service",
  "rework",
  "other",
] as const

/**
 * Mirror a service/subcontract PurchaseOrder's value onto a single `subcontract`
 * ProductionCost line for the production order(s) its work order fulfils
 * (VEH/G4 → FAB-08: subcontract is a real cost of the job and must show up in
 * HPP). The line is unique per `purchaseOrderId`; a change to the PO's value
 * applies only the delta so the order's running total stays exact.
 *
 * Only service POs linked to a work order participate, and only when that work
 * order has at least one production order. Passing a non-positive amount removes
 * the line (and subtracts it from HPP). Non-service POs are ignored (their value
 * is capitalised into inventory at goods receipt).
 */
export async function syncServicePurchaseOrderCost(
  input: {
    purchaseOrderId: number
    amount: number
    documentNo: string
    createdBy: number | null
  },
  client: TxClient | typeof prisma = prisma,
): Promise<{ posted: number; productionOrderIds: number[] }> {
  const po = await client.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    select: { isService: true, workOrderId: true, vendorId: true },
  })
  if (!po || !po.isService || po.workOrderId == null) {
    return { posted: 0, productionOrderIds: [] }
  }

  const productionOrders = await client.productionOrder.findMany({
    where: { workOrderId: po.workOrderId },
    select: { id: true },
  })
  if (productionOrders.length === 0) {
    return { posted: 0, productionOrderIds: [] }
  }

  const desiredTotal = Math.max(0, Number(input.amount) || 0)
  const existingLines = await client.productionCost.findMany({
    where: { purchaseOrderId: input.purchaseOrderId, category: "subcontract" },
    select: { id: true, amount: true, productionOrderId: true },
  })

  if (desiredTotal === 0) {
    if (existingLines.length) {
      for (const line of existingLines) {
        await client.productionCost.delete({ where: { id: line.id } })
        if (line.productionOrderId != null) {
          await applyProductionCostDelta(line.productionOrderId, -Number(line.amount), client, {
            userId: input.createdBy ?? undefined,
            costLineId: line.id,
          })
        }
      }
    }
    return { posted: 0, productionOrderIds: productionOrders.map((o) => o.id) }
  }

  // Spread the PO value across the work order's production orders equally per
  // order (the job's output is what the subcontract supports). One line per
  // production order keeps HPP attribution precise.
  const perOrder = Math.round((desiredTotal / productionOrders.length) * 100) / 100
  const remainder = safeAdd(desiredTotal, -safeMultiply(perOrder, productionOrders.length, 2), 2)

  const byOrder = new Map(existingLines.filter((l) => l.productionOrderId != null).map((l) => [l.productionOrderId!, l]))

  for (let i = 0; i < productionOrders.length; i++) {
    const orderId = productionOrders[i].id
    // Put any rounding remainder on the first order so the sum is exact.
    const target = i === 0 ? safeAdd(perOrder, remainder, 2) : perOrder
    const existing = byOrder.get(orderId)
    const currentAmount = existing ? Number(existing.amount) : 0

    if (existing) {
      await client.productionCost.update({
        where: { id: existing.id },
        data: {
          amount: target,
          description: `Subkontrak PO ${input.documentNo}`,
        },
      })
    } else {
      await client.productionCost.create({
        data: {
          productionOrderId: orderId,
          workOrderId: po.workOrderId,
          purchaseOrderId: input.purchaseOrderId,
          vendorId: po.vendorId,
          category: "subcontract",
          description: `Subkontrak PO ${input.documentNo}`,
          amount: target,
          postedAt: new Date(),
          createdBy: input.createdBy,
        },
      })
    }
    await applyProductionCostDelta(orderId, target - currentAmount, client, {
      userId: input.createdBy ?? undefined,
      costLineId: existing?.id,
    })
  }

  // Clean up any orphaned lines for production orders that no longer exist.
  for (const line of existingLines) {
    if (line.productionOrderId == null || !productionOrders.some((o) => o.id === line.productionOrderId)) {
      await client.productionCost.delete({ where: { id: line.id } })
      if (line.productionOrderId != null) {
        await applyProductionCostDelta(line.productionOrderId, -Number(line.amount), client, {
          userId: input.createdBy ?? undefined,
          costLineId: line.id,
        })
      }
    }
  }

  // `existingTotal` is the prior total; return the newly posted amount.
  return { posted: desiredTotal, productionOrderIds: productionOrders.map((o) => o.id) }
}

/**
 * Mirror an NCR's `reworkCost` onto a single `rework` ProductionCost line for the
 * production order the NCR references (PRD FAB-11 → FAB-09: rework is a real cost
 * of the job and must show up in HPP). The line is unique per NCR; a change to
 * the NCR's rework cost applies only the delta so the order's running total stays
 * exact.
 *
 * Only `referenceType === "ProductionOrder"` participates — rework captured
 * against a work order or goods receipt has no production HPP to roll into.
 * Passing a non-positive amount removes the line (and subtracts it from HPP).
 */
export async function syncReworkCostToOrder(
  input: {
    nonconformance: { id: number; referenceType: string; referenceId: number }
    reworkCost: number
    reworkHours: number
    documentNo: string
    createdBy: number | null
  },
  client: TxClient | typeof prisma = prisma,
): Promise<{ posted: number; productionOrderId: number | null }> {
  const { nonconformance } = input
  if (nonconformance.referenceType !== "ProductionOrder") {
    return { posted: 0, productionOrderId: null }
  }
  const productionOrderId = nonconformance.referenceId
  const desired = Math.max(0, Number(input.reworkCost) || 0)

  const existing = await client.productionCost.findUnique({
    where: { nonconformanceId: nonconformance.id },
    select: { id: true, amount: true },
  })
  const currentAmount = existing ? Number(existing.amount) : 0

  // Remove the line when the rework cost is cleared.
  if (desired === 0) {
    if (existing) {
      await client.productionCost.delete({ where: { id: existing.id } })
      await applyProductionCostDelta(productionOrderId, -currentAmount, client, {
        userId: input.createdBy ?? undefined,
        costLineId: existing.id,
      })
    }
    return { posted: 0, productionOrderId }
  }

  if (existing) {
    await client.productionCost.update({
      where: { id: existing.id },
      data: {
        amount: desired,
        hours: input.reworkHours,
        description: `Biaya rework NCR ${input.documentNo}`,
      },
    })
  } else {
    await client.productionCost.create({
      data: {
        productionOrderId,
        category: "rework",
        description: `Biaya rework NCR ${input.documentNo}`,
        hours: input.reworkHours,
        amount: desired,
        nonconformanceId: nonconformance.id,
        postedAt: new Date(),
        createdBy: input.createdBy,
      },
    })
  }
  await applyProductionCostDelta(productionOrderId, desired - currentAmount, client, {
    userId: input.createdBy ?? undefined,
    costLineId: existing?.id,
  })
  return { posted: desired, productionOrderId }
}
