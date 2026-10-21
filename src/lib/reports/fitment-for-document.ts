/**
 * Builder murni fitment per dokumen (F-2026-10-21-023 lapis aman).
 *
 * Backlog F-023: checker fitment yatim — `evaluateFitment` hanya dipanggil
 * halaman kendaraan, tidak pernah dari Quotation/WO. Lapis aman ini hanya
 * MEMBACA: turunkan konfigurasi kendaraan dari rantai master
 * CustomerVehicle → Vehicle → VehicleVariant → VehicleModel → VehicleBrand,
 * lalu evaluasi tiap baris item dokumen terhadap aturan fitment aktif.
 *
 * Kontrak jujur (wajib ditempel frontend apa adanya):
 * - Hasil `incompatible` = peringatan keras; `unknown` = lencana netral
 *   (belum diketahui, BUKAN cocok); `compatible` = cocok menurut aturan.
 * - Baris jasa (`isService`) dan baris tanpa itemId dilewati — fitment
 *   hanya untuk part fisik.
 * - Builder ini TIDAK menahan, mengubah, atau menerbitkan dokumen apa pun.
 *   Blokir keras = putusan team-lead sesudah peringatan terbukti dipakai.
 *
 * Semantik evaluasi sama persis evaluator existing
 * (`vehicle-fitment.service.ts`): aturan cocok bila tiap dimensi scope
 * yang terisi sama dengan konfigurasi (null = wildcard); pemenang =
 * specificity tertinggi, seri diputus id aturan terbaru. Builder tidak
 * mengarang semantik kedua — loader meneruskan baris aturan aktif apa
 * adanya dan builder memilih pemenang dengan aturan yang sama.
 *
 * Pure (tanpa Prisma/DOM). Loader DB ada di `fitment-for-document-data.ts`.
 */

export type FitmentDocumentResult = "compatible" | "incompatible" | "unknown"

/** Label kontrak — frontend wajib menempel apa adanya, jangan parafrase. */
export const FITMENT_FOR_DOCUMENT_NOTICE =
  "Peringatan fitment bersifat informatif: dokumen tetap dapat diterbitkan. " +
  "Hasil tidak cocok wajib diverifikasi teknisi sebelum part dipasang."

export interface FitmentConfiguration {
  vehicleBrandId: number | null
  vehicleModelId: number | null
  vehicleVariantId: number | null
  year: number | null
  drivetrain: string | null
  transmission: string | null
}

/** Rantai master mentah satu CustomerVehicle (loader yang mengisi). */
export interface CustomerVehicleChainInput {
  customerVehicleId: number
  vehicleYear: number | null
  variantId: number | null
  variantDrivetrain: string | null
  variantTransmission: string | null
  modelId: number | null
  brandId: number | null
}

/** Turunkan konfigurasi evaluasi dari rantai master kendaraan pelanggan. */
export function configurationFromCustomerVehicle(
  chain: CustomerVehicleChainInput,
): FitmentConfiguration {
  return {
    vehicleBrandId: chain.brandId,
    vehicleModelId: chain.modelId,
    vehicleVariantId: chain.variantId,
    year: chain.vehicleYear,
    drivetrain: chain.variantDrivetrain,
    transmission: chain.variantTransmission,
  }
}

export interface FitmentRuleInput {
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

export interface FitmentDocumentLineInput {
  /** Id baris dokumen (QuotationItem.id / WorkOrderItem.id). */
  lineId: number
  itemId: number | null
  description: string | null
  isService: boolean
  bomRevisionId?: number | null
}

export interface FitmentDocumentLine {
  lineId: number
  itemId: number
  description: string | null
  result: FitmentDocumentResult
  ruleId: number | null
  source: string | null
  notes: string | null
  reason: string
}

export interface FitmentForDocumentResult {
  configuration: FitmentConfiguration
  lines: FitmentDocumentLine[]
  counts: {
    compatible: number
    incompatible: number
    unknown: number
    skipped: number
  }
  notice: string
}

function norm(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim().toLowerCase()
  return trimmed === "" ? null : trimmed
}

function specificity(rule: FitmentRuleInput): number {
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

function ruleMatches(
  rule: FitmentRuleInput,
  q: FitmentConfiguration,
  bomRevisionId: number | null,
): boolean {
  if (rule.bomRevisionId != null && rule.bomRevisionId !== bomRevisionId) return false
  if (rule.vehicleBrandId != null && rule.vehicleBrandId !== q.vehicleBrandId) return false
  if (rule.vehicleModelId != null && rule.vehicleModelId !== q.vehicleModelId) return false
  if (rule.vehicleVariantId != null && rule.vehicleVariantId !== q.vehicleVariantId) return false
  if (rule.yearFrom != null && (q.year == null || q.year < rule.yearFrom)) return false
  if (rule.yearTo != null && (q.year == null || q.year > rule.yearTo)) return false
  const ruleDrivetrain = norm(rule.drivetrain)
  if (ruleDrivetrain != null && ruleDrivetrain !== norm(q.drivetrain)) return false
  const ruleTransmission = norm(rule.transmission)
  if (ruleTransmission != null && ruleTransmission !== norm(q.transmission)) return false
  return true
}

function toResult(value: string): FitmentDocumentResult {
  return value === "compatible" || value === "incompatible" ? value : "unknown"
}

const REASON_BY_RESULT: Record<FitmentDocumentResult, string> = {
  compatible: "Cocok menurut aturan fitment.",
  incompatible: "Tidak cocok menurut aturan fitment.",
  unknown: "Aturan fitment menandai perlu verifikasi.",
}

/** Evaluasi satu item terhadap konfigurasi; tanpa aturan cocok = unknown. */
export function evaluateLineFitment(
  configuration: FitmentConfiguration,
  itemId: number,
  rules: readonly FitmentRuleInput[],
  bomRevisionId: number | null = null,
): Omit<FitmentDocumentLine, "lineId" | "itemId" | "description"> {
  const matching = rules.filter(
    (rule) => rule.itemId === itemId && ruleMatches(rule, configuration, bomRevisionId),
  )
  if (matching.length === 0) {
    return {
      result: "unknown",
      ruleId: null,
      source: null,
      notes: null,
      reason: "Tidak ada aturan fitment yang cocok; kompatibilitas belum diketahui.",
    }
  }
  const winner = [...matching].sort((a, b) => {
    const diff = specificity(b) - specificity(a)
    return diff !== 0 ? diff : b.id - a.id
  })[0]
  const result = toResult(winner.result)
  return {
    result,
    ruleId: winner.id,
    source: winner.source,
    notes: winner.notes,
    reason: REASON_BY_RESULT[result],
  }
}

/**
 * Evaluasi seluruh baris dokumen. Baris jasa / tanpa itemId dihitung
 * `skipped`, tidak dievaluasi dan tidak masuk counts hasil.
 */
export function buildFitmentForDocument(input: {
  configuration: FitmentConfiguration
  lines: readonly FitmentDocumentLineInput[]
  rules: readonly FitmentRuleInput[]
}): FitmentForDocumentResult {
  const lines: FitmentDocumentLine[] = []
  const counts = { compatible: 0, incompatible: 0, unknown: 0, skipped: 0 }

  for (const line of input.lines) {
    if (line.isService || line.itemId == null) {
      counts.skipped += 1
      continue
    }
    const evaluated = evaluateLineFitment(
      input.configuration,
      line.itemId,
      input.rules,
      line.bomRevisionId ?? null,
    )
    counts[evaluated.result] += 1
    lines.push({
      lineId: line.lineId,
      itemId: line.itemId,
      description: line.description,
      ...evaluated,
    })
  }

  return {
    configuration: input.configuration,
    lines,
    counts,
    notice: FITMENT_FOR_DOCUMENT_NOTICE,
  }
}
