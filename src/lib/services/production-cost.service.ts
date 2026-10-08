import { prisma, TxClient } from "@/lib/db/prisma"
import { safeAdd } from "@/lib/utils/math"

/**
 * Non-material production cost rollup (PRD FAB-06/07/08/09).
 *
 * `ProductionOrder.totalActualCost` starts as the sum of issued material cost
 * (`issueMaterial`). Non-material cost lines (`ProductionCost`: labor, machine,
 * overhead, subcontract, service) are additive on top of that. This module
 * keeps the two in sync without ever double-counting: the material portion is
 * never recomputed here, only the non-material delta is applied.
 */

/** Sum of all non-material cost lines for a production order. */
export async function sumProductionCosts(
  productionOrderId: number,
  client: TxClient | typeof prisma = prisma,
): Promise<number> {
  const agg = await client.productionCost.aggregate({
    where: { productionOrderId },
    _sum: { amount: true },
  })
  return Number(agg._sum.amount ?? 0)
}

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
): Promise<void> {
  if (delta === 0) return
  await client.$queryRaw`SELECT id FROM production_orders WHERE id = ${productionOrderId} FOR UPDATE`
  const order = await client.productionOrder.findUnique({
    where: { id: productionOrderId },
    select: { totalActualCost: true },
  })
  if (!order) return
  const next = Math.max(0, safeAdd(Number(order.totalActualCost), delta, 2))
  await client.productionOrder.update({
    where: { id: productionOrderId },
    data: { totalActualCost: next },
  })
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
      await applyProductionCostDelta(productionOrderId, -currentAmount, client)
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
  await applyProductionCostDelta(productionOrderId, desired - currentAmount, client)
  return { posted: desired, productionOrderId }
}
