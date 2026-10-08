import { prisma } from "@/lib/db/prisma"
import { safeSubtract } from "@/lib/utils/math"

/**
 * Overhead under/over-absorption report (PRD FAB-07 / REP-16).
 *
 * Compares, for a period:
 *   - APPLIED overhead   — the sum of driver-based overhead lines posted onto
 *                          production orders in the period (system-applied), plus
 *                          any manual `overhead` ProductionCost lines.
 *   - ACTUAL overhead    — the net debit balance of the configured overhead
 *                          account(s) from posted journals in the period.
 *   - VARIANCE           — applied − actual. Positive = over-absorbed (charged to
 *                          jobs more than actually incurred), negative = under-
 *                          absorbed (a real cost the jobs did not yet carry).
 *
 * Only posted journals feed the actual side; drafts are ignored so the report
 * never reads provisional numbers as final (PRD RPT-01).
 */

export interface OverheadAbsorptionLine {
  productionOrderId: number
  documentNo: string
  driverType: string | null
  applied: number
}

export interface OverheadAbsorptionResult {
  period: string
  appliedTotal: number
  manualOverheadTotal: number
  actualTotal: number
  /** applied − actual. > 0 over-absorbed, < 0 under-absorbed. */
  variance: number
  /** True when the overhead account is not configured (actual side is 0). */
  accountUnconfigured: boolean
  overheadAccountIds: number[]
  lines: OverheadAbsorptionLine[]
}

function periodBounds(period: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = period.split("-")
  const year = Number(yearStr)
  const month = Number(monthStr)
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  }
}

/**
 * Build the under/over-absorption report for a `YYYY-MM` period.
 *
 * `overheadAccountIds` should come from SystemSettings (overhead/general expense
 * accounts). When empty, the actual side is reported as 0 and flagged so the
 * caller can prompt configuration rather than silently show a false variance.
 */
export async function buildOverheadAbsorptionReport(
  period: string,
  overheadAccountIds: number[],
): Promise<OverheadAbsorptionResult> {
  const { start, end } = periodBounds(period)
  const accountIds = overheadAccountIds.filter((id) => Number.isInteger(id) && id > 0)

  // APPLIED side: driver-based + manual overhead cost lines posted in the period.
  // `postedAt` (fallback createdAt) decides the period so a line applied in a
  // month is not restated into a closed month.
  const costLines = await prisma.productionCost.findMany({
    where: {
      productionOrderId: { not: null },
      category: "overhead",
      OR: [
        { postedAt: { gte: start, lt: end } },
        { postedAt: null, createdAt: { gte: start, lt: end } },
      ],
    },
    select: {
      productionOrderId: true,
      amount: true,
      driverType: true,
      isAppliedOverhead: true,
      productionOrder: { select: { documentNo: true } },
    },
  })

  let appliedTotal = 0
  let manualOverheadTotal = 0
  const lines: OverheadAbsorptionLine[] = []
  for (const c of costLines) {
    const amt = Number(c.amount)
    appliedTotal += amt
    if (!c.isAppliedOverhead) manualOverheadTotal += amt
    lines.push({
      productionOrderId: c.productionOrderId as number,
      documentNo: c.productionOrder?.documentNo ?? `#${c.productionOrderId}`,
      driverType: c.driverType,
      applied: amt,
    })
  }

  // ACTUAL side: net debit balance of the overhead account(s) from posted
  // journals. Include REVERSED to match every other report: a reversal is
  // posted as its own journal, so counting both makes a reversed overhead entry
  // net to zero. Filtering POSTED only would leave a reversed expense counted
  // in `actualTotal`, skewing the under/over-absorption variance.
  let actualTotal = 0
  if (accountIds.length > 0) {
    const entries = await prisma.journalEntry.findMany({
      where: {
        accountId: { in: accountIds },
        journal: {
          status: { in: ["POSTED", "REVERSED"] },
          deletedAt: null,
          transactionDate: { gte: start, lt: end },
        },
      },
      select: { debit: true, credit: true },
    })
    actualTotal = entries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0)
  }

  return {
    period,
    appliedTotal,
    manualOverheadTotal,
    actualTotal,
    variance: safeSubtract(appliedTotal, actualTotal, 2),
    accountUnconfigured: accountIds.length === 0,
    overheadAccountIds: accountIds,
    lines: lines.sort((a, b) => b.applied - a.applied),
  }
}
