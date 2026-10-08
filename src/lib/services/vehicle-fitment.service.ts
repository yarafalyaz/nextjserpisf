import type { Prisma } from "@prisma/client"

/**
 * VEH-07 — Kompatibilitas part/BOM ke konfigurasi kendaraan.
 *
 * A fitment rule scopes an item (SKU) — optionally a BOM revision — to a vehicle
 * configuration and declares `compatible`, `incompatible`, or `unknown`. The
 * evaluation picks the MOST SPECIFIC matching rule; when no rule matches the
 * result is `unknown`, so callers can require technical verification before
 * releasing work/components (PRD VEH-06/07).
 */

export type FitmentResult = "compatible" | "incompatible" | "unknown"

export interface VehicleConfigurationQuery {
  vehicleBrandId?: number | null
  vehicleModelId?: number | null
  vehicleVariantId?: number | null
  year?: number | null
  drivetrain?: string | null
  transmission?: string | null
}

export interface FitmentEvaluation {
  result: FitmentResult
  /** The rule that decided the outcome (null when nothing matched → unknown). */
  ruleId: number | null
  source: string | null
  notes: string | null
  reason: string
}

type FitmentRuleRow = {
  id: number
  itemId: number
  bomRevisionId: number | null
  vehicleBrandId: number | null
  vehicleModelId: number | null
  vehicleVariantId: number | null
  yearFrom: number | null
  yearTo: number | null
  drivetrain: string | null
  transmission: string | null
  result: string
  source: string | null
  notes: string | null
}

function norm(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim().toLowerCase()
  return trimmed === "" ? null : trimmed
}

/**
 * Specificity score: more constrained scope = more specific = wins. Each scope
 * dimension that is set contributes; variant outranks model outranks brand, and
 * year/drivetrain/transmission narrow further. BOM-revision-scoped rules beat
 * item-wide rules on a tie.
 */
function specificity(rule: FitmentRuleRow): number {
  let score = 0
  if (rule.vehicleVariantId != null) score += 8
  else if (rule.vehicleModelId != null) score += 4
  else if (rule.vehicleBrandId != null) score += 2
  if (rule.yearFrom != null || rule.yearTo != null) score += 1
  if (norm(rule.drivetrain)) score += 1
  if (norm(rule.transmission)) score += 1
  if (rule.bomRevisionId != null) score += 1
  return score
}

/** Does a rule's scope apply to the queried configuration? */
function ruleMatches(rule: FitmentRuleRow, q: VehicleConfigurationQuery): boolean {
  if (rule.vehicleBrandId != null && rule.vehicleBrandId !== (q.vehicleBrandId ?? null)) return false
  if (rule.vehicleModelId != null && rule.vehicleModelId !== (q.vehicleModelId ?? null)) return false
  if (rule.vehicleVariantId != null && rule.vehicleVariantId !== (q.vehicleVariantId ?? null)) return false

  if (rule.yearFrom != null) {
    if (q.year == null || q.year < rule.yearFrom) return false
  }
  if (rule.yearTo != null) {
    if (q.year == null || q.year > rule.yearTo) return false
  }

  const ruleDrivetrain = norm(rule.drivetrain)
  if (ruleDrivetrain != null && ruleDrivetrain !== norm(q.drivetrain)) return false
  const ruleTransmission = norm(rule.transmission)
  if (ruleTransmission != null && ruleTransmission !== norm(q.transmission)) return false

  return true
}

function toFitmentResult(value: string): FitmentResult {
  return value === "compatible" || value === "incompatible" ? value : "unknown"
}

/**
 * Evaluate fitment for an item (and optional BOM revision) against a vehicle
 * configuration, using the provided transaction/client. Rules are read fresh so
 * the check always reflects the current catalog.
 */
export async function evaluateFitment(
  db: Prisma.TransactionClient,
  params: {
    itemId: number
    bomRevisionId?: number | null
    configuration: VehicleConfigurationQuery
  },
): Promise<FitmentEvaluation> {
  const rules = (await db.vehicleFitmentRule.findMany({
    where: {
      itemId: params.itemId,
      isActive: true,
      // A BOM-revision-scoped rule only applies when that revision is requested;
      // an item-wide rule (null revision) always applies.
      ...(params.bomRevisionId
        ? { OR: [{ bomRevisionId: params.bomRevisionId }, { bomRevisionId: null }] }
        : { bomRevisionId: null }),
    },
    orderBy: { id: "asc" },
  })) as FitmentRuleRow[]

  const matching = rules.filter((rule) => ruleMatches(rule, params.configuration))
  if (matching.length === 0) {
    return {
      result: "unknown",
      ruleId: null,
      source: null,
      notes: null,
      reason: "Tidak ada aturan fitment yang cocok; kompatibilitas belum diketahui.",
    }
  }

  // Most specific rule wins; ties broken by newest id (later rules override).
  matching.sort((a, b) => {
    const diff = specificity(b) - specificity(a)
    return diff !== 0 ? diff : b.id - a.id
  })
  const winner = matching[0]

  return {
    result: toFitmentResult(winner.result),
    ruleId: winner.id,
    source: winner.source,
    notes: winner.notes,
    reason:
      toFitmentResult(winner.result) === "compatible"
        ? "Cocok menurut aturan fitment."
        : toFitmentResult(winner.result) === "incompatible"
          ? "Tidak cocok menurut aturan fitment."
          : "Aturan fitment menandai perlu verifikasi.",
  }
}

/**
 * Evaluate a product's whole material list (its current working BOM) against a
 * vehicle configuration, returning per-line outcomes. Used by the product detail
 * fitment checker. Lines without any rule are `unknown`.
 */
export async function evaluateProductFitment(
  db: Prisma.TransactionClient,
  params: {
    productId: number
    bomRevisionId?: number | null
    configuration: VehicleConfigurationQuery
  },
): Promise<
  Array<{
    itemId: number
    result: FitmentResult
    evaluation: FitmentEvaluation
  }>
> {
  const materials = await db.productMaterial.findMany({
    where: { productId: params.productId },
    select: { itemId: true },
  })

  const results = await Promise.all(
    materials.map(async (m) => ({
      itemId: m.itemId,
      evaluation: await evaluateFitment(db, {
        itemId: m.itemId,
        bomRevisionId: params.bomRevisionId ?? null,
        configuration: params.configuration,
      }),
    })),
  )

  return results.map((r) => ({
    itemId: r.itemId,
    result: r.evaluation.result,
    evaluation: r.evaluation,
  }))
}
