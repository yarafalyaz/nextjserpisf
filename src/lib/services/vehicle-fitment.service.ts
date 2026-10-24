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

/**
 * Scope of a candidate fitment rule, as supplied by the fitment form /
 * create-update actions. `bomRevisionId` is included so rules tied to different
 * BOM revisions are never treated as the same scope.
 */
export interface FitmentRuleScope {
  itemId: number
  bomRevisionId?: number | null
  vehicleBrandId?: number | null
  vehicleModelId?: number | null
  vehicleVariantId?: number | null
  yearFrom?: number | null
  yearTo?: number | null
  drivetrain?: string | null
  transmission?: string | null
  result: string
}

/** One active rule whose scope conflicts with a candidate scope. */
export interface FitmentConflict {
  /** Id of the existing (opposing) rule. */
  ruleId: number
  /** Candidate result normalised via `toFitmentResult`. */
  candidateResult: FitmentResult
  /** Opposing rule result normalised via `toFitmentResult`. */
  conflictResult: FitmentResult
  /** Specificity score shared by candidate and opposing rule. */
  specificity: number
  /** Scope of the opposing rule (raw stored values; UI displays as-is). */
  scope: {
    itemId: number
    bomRevisionId: number | null
    vehicleBrandId: number | null
    vehicleModelId: number | null
    vehicleVariantId: number | null
    yearFrom: number | null
    yearTo: number | null
    drivetrain: string | null
    transmission: string | null
  }
  source: string | null
  notes: string | null
}

function sameScope(a: FitmentRuleScope, b: FitmentRuleRow): boolean {
  return (
    a.itemId === b.itemId &&
    (a.bomRevisionId ?? null) === b.bomRevisionId &&
    (a.vehicleBrandId ?? null) === b.vehicleBrandId &&
    (a.vehicleModelId ?? null) === b.vehicleModelId &&
    (a.vehicleVariantId ?? null) === b.vehicleVariantId &&
    (a.yearFrom ?? null) === b.yearFrom &&
    (a.yearTo ?? null) === b.yearTo &&
    norm(a.drivetrain) === norm(b.drivetrain) &&
    norm(a.transmission) === norm(b.transmission)
  )
}

/**
 * Pure conflict definition for F-2026-10-21-025: an existing rule conflicts
 * with a candidate when both have the SAME specificity (existing
 * `specificity()`) AND an identical scope (every scope dimension equal, with
 * drivetrain/transmission compared via existing `norm()`) AND opposite
 * results (normalised via `toFitmentResult`, so only compatible vs
 * incompatible count as opposite; `unknown` never conflicts). UI must display
 * this result as-is and must not recompute scope equality/specificity.
 */
export function findFitmentConflicts(
  candidate: FitmentRuleScope,
  rules: FitmentRuleRow[],
  excludeRuleId?: number | null,
): FitmentConflict[] {
  const candidateResult = toFitmentResult(candidate.result)
  if (candidateResult === "unknown") return []
  const candidateRow: FitmentRuleRow = {
    id: 0,
    itemId: candidate.itemId,
    bomRevisionId: candidate.bomRevisionId ?? null,
    vehicleBrandId: candidate.vehicleBrandId ?? null,
    vehicleModelId: candidate.vehicleModelId ?? null,
    vehicleVariantId: candidate.vehicleVariantId ?? null,
    yearFrom: candidate.yearFrom ?? null,
    yearTo: candidate.yearTo ?? null,
    drivetrain: candidate.drivetrain ?? null,
    transmission: candidate.transmission ?? null,
    result: candidate.result,
    source: null,
    notes: null,
  }
  const candidateSpecificity = specificity(candidateRow)
  return rules
    .filter((rule) => rule.id !== excludeRuleId)
    .filter((rule) => sameScope(candidate, rule))
    .filter((rule) => specificity(rule) === candidateSpecificity)
    .filter((rule) => {
      const other = toFitmentResult(rule.result)
      return other !== "unknown" && other !== candidateResult
    })
    .map((rule) => ({
      ruleId: rule.id,
      candidateResult,
      conflictResult: toFitmentResult(rule.result),
      specificity: candidateSpecificity,
      scope: {
        itemId: rule.itemId,
        bomRevisionId: rule.bomRevisionId,
        vehicleBrandId: rule.vehicleBrandId,
        vehicleModelId: rule.vehicleModelId,
        vehicleVariantId: rule.vehicleVariantId,
        yearFrom: rule.yearFrom,
        yearTo: rule.yearTo,
        drivetrain: rule.drivetrain,
        transmission: rule.transmission,
      },
      source: rule.source,
      notes: rule.notes,
    }))
}

/**
 * Loader for the fitment-rule form (create + edit): returns conflicts between
 * a candidate scope and the item's other ACTIVE rules. Excludes the rule
 * being edited (`excludeRuleId`) and, by construction in
 * `findFitmentConflicts`, never reports unknown-vs-known or same-result pairs.
 */
export async function loadFitmentConflicts(
  db: Prisma.TransactionClient,
  params: { candidate: FitmentRuleScope; excludeRuleId?: number | null },
): Promise<FitmentConflict[]> {
  const rules = (await db.vehicleFitmentRule.findMany({
    where: { itemId: params.candidate.itemId, isActive: true },
    orderBy: { id: "asc" },
  })) as FitmentRuleRow[]
  return findFitmentConflicts(params.candidate, rules, params.excludeRuleId)
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

/**
 * F-2026-10-22-063-S (induk F-2026-10-21-023): rakit konfigurasi kendaraan
 * dari rantai master existing CustomerVehicle → Vehicle → VehicleVariant →
 * VehicleModel (brand dari model). Null bila kendaraan tak ditemukan /
 * terhapus. Tanpa field baru — semua FK existing.
 */
export async function configurationFromCustomerVehicle(
  db: Prisma.TransactionClient,
  customerVehicleId: number,
): Promise<VehicleConfigurationQuery | null> {
  const cv = await db.customerVehicle.findFirst({
    where: { id: customerVehicleId, deletedAt: null },
    select: {
      vehicle: {
        select: {
          year: true,
          variant: {
            select: {
              id: true,
              drivetrain: true,
              transmission: true,
              model: { select: { id: true, vehicleBrandId: true } },
            },
          },
        },
      },
    },
  })
  if (!cv) return null
  const variant = cv.vehicle.variant
  return {
    vehicleBrandId: variant.model.vehicleBrandId,
    vehicleModelId: variant.model.id,
    vehicleVariantId: variant.id,
    year: cv.vehicle.year,
    drivetrain: variant.drivetrain,
    transmission: variant.transmission,
  }
}

/**
 * F-2026-10-22-063-S: tulis snapshot PERINGATAN fitment ke baris Quotation
 * yang baru disimpan (BR-FIT-03: evaluasi ulang tiap simpan). Dokumen tanpa
 * kendaraan → diam (W1). Baris itemId null dilewati (BR-FIT-04). Hasil apa
 * pun TIDAK memblokir dokumen (BR-FIT-01); evaluasi gagal ditelan supaya
 * simpan tetap jalan (BR-FIT-09) — snapshot baris itu tetap null.
 */
export async function stampQuotationFitmentSnapshot(
  db: Prisma.TransactionClient,
  quotationId: number,
): Promise<void> {
  try {
    const quotation = await db.quotation.findFirst({
      where: { id: quotationId },
      select: {
        customerVehicleId: true,
        sections: {
          select: {
            items: {
              where: { itemId: { not: null } },
              select: { id: true, itemId: true },
            },
          },
        },
      },
    })
    if (!quotation?.customerVehicleId) return
    const configuration = await configurationFromCustomerVehicle(
      db,
      quotation.customerVehicleId,
    )
    if (!configuration) return
    const evaluatedAt = new Date()
    for (const section of quotation.sections) {
      for (const line of section.items) {
        if (line.itemId == null) continue
        const evaluation = await evaluateFitment(db, {
          itemId: line.itemId,
          configuration,
        })
        await db.quotationItem.update({
          where: { id: line.id },
          data: {
            fitmentResult: evaluation.result,
            fitmentRuleId: evaluation.ruleId,
            fitmentEvaluatedAt: evaluatedAt,
          },
        })
      }
    }
  } catch (error) {
    // BR-FIT-09: snapshot gagal tidak boleh menggagalkan simpan dokumen.
    console.error("[fitment] snapshot Quotation gagal (simpan tetap jalan)", error)
  }
}

/**
 * F-2026-10-22-063-S: snapshot PERINGATAN fitment baris WorkOrder, pola sama
 * stampQuotationFitmentSnapshot. Baris jasa itemId=0 dilewati (BR-FIT-04).
 * bomRevisionId WO diteruskan ke evaluator (aturan scoped-revisi berlaku).
 */
export async function stampWorkOrderFitmentSnapshot(
  db: Prisma.TransactionClient,
  workOrderId: number,
): Promise<void> {
  try {
    const workOrder = await db.workOrder.findFirst({
      where: { id: workOrderId },
      select: {
        customerVehicleId: true,
        bomRevisionId: true,
        items: {
          where: { itemId: { gt: 0 } },
          select: { id: true, itemId: true },
        },
      },
    })
    if (!workOrder?.customerVehicleId) return
    const configuration = await configurationFromCustomerVehicle(
      db,
      workOrder.customerVehicleId,
    )
    if (!configuration) return
    const evaluatedAt = new Date()
    for (const line of workOrder.items) {
      const evaluation = await evaluateFitment(db, {
        itemId: line.itemId,
        bomRevisionId: workOrder.bomRevisionId,
        configuration,
      })
      await db.workOrderItem.update({
        where: { id: line.id },
        data: {
          fitmentResult: evaluation.result,
          fitmentRuleId: evaluation.ruleId,
          fitmentEvaluatedAt: evaluatedAt,
        },
      })
    }
  } catch (error) {
    // BR-FIT-09: snapshot gagal tidak boleh menggagalkan simpan dokumen.
    console.error("[fitment] snapshot WorkOrder gagal (simpan tetap jalan)", error)
  }
}
