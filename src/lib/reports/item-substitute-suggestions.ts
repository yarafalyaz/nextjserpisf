/**
 * Builder murni saran substitusi part per baris WO (F-2026-10-22-069-S,
 * spec BOT 5 + PUTUSAN BOT 1 Q-SUB69-1..4 + vonis BOT 4
 * F-2026-10-22-075-V Q-SUB69-5).
 *
 * Saran adalah READ-ONLY dan TURUNAN: status baris dibaca dari builder
 * WorkOrderPartStatus existing dan stok efektif dari builder
 * WorkOrderMaterialNeeds existing — builder ini TIDAK menghitung stok
 * atau status kedua (AC-SUB69-2). Ia hanya menempelkan relasi substitusi
 * aktif (langsung, satu arah, TIDAK transitif — BR-SUB69-02) ke baris
 * yang memenuhi syarat tampil:
 *
 * - baris stok (itemId > 0), belum `replaced`, belum ter-issue sama
 *   sekali (issuedQty = 0; baris terpasang-sebagian/terpasang tidak
 *   pernah dapat saran — AC-SUB69-2/AC-SUB69-9), dan
 * - status turunan `menunggu`/`dipesan`, ATAU stok efektif kurang
 *   (shortageQty > 0 dari material-needs) — BR-SUB69-03.
 *
 * Fitment pengganti terhadap kendaraan WO dinilai loader dari service
 * existing dan diteruskan apa adanya: `incompatible` tampil sebagai
 * DITOLAK dengan alasan server verbatim (AC-SUB69-7), bukan disembunyikan;
 * `unknown` (termasuk WO tanpa kendaraan) lolos dengan peringatan
 * (Q-SUB69-2). Saran tidak pernah mengganti otomatis (BR-SUB69-03);
 * penerapan hanya lewat reviseWorkOrderItems existing dan tidak
 * menggerakkan stok/reservasi/jurnal (BR-SUB69-04/06).
 *
 * Vonis Q-SUB69-5: TIDAK ada kolom selisih-sebagai-tagihan dan tidak ada
 * harga/biaya khusus substitusi — angka yang tampil murni label
 * informatif read-only dari master existing untuk keputusan manusia.
 */

import type { FitmentResult } from "@/lib/services/vehicle-fitment.service"
import type { WorkOrderPartStatus } from "@/lib/reports/work-order-part-status"

export const ITEM_SUBSTITUTE_SUGGESTION_NOTICE =
  "Saran substitusi read-only dari relasi master barang yang aktif " +
  "(langsung, tidak transitif). Status baris dan stok efektif dibaca " +
  "dari status part + kebutuhan material existing — bukan hitungan " +
  "kedua. Saran tidak mengganti otomatis; penerapan hanya lewat revisi " +
  "item perintah kerja existing dan tidak menggerakkan stok."

export interface SubstituteSuggestionLineInput {
  workOrderItemId: number
  itemId: number
  description: string | null
  qty: number
  /** Status turunan dari buildWorkOrderPartStatus. */
  partStatus: WorkOrderPartStatus
  /** Qty sudah ter-issue (MaterialIssue completed) dari part-status. */
  issuedQty: number
  /** Kekurangan stok efektif dari buildWorkOrderMaterialNeeds; 0 = cukup. */
  shortageQty: number
}

export interface SubstituteCandidateInput {
  /** Id relasi ItemSubstitute (satu baris = satu arah). */
  substituteId: number
  itemId: number
  substituteItemId: number
  substituteName: string
  substituteSku: string
  substituteUnitOfMeasure: string
  /** Catatan kesetaraan di relasi master (boleh kosong). */
  notes: string | null
  /** Stok efektif pengganti dari material-needs existing (sudah dikurangi committed WO lain). */
  effectiveAvailableQty: number
  /** Hasil fitment pengganti ke kendaraan WO dari service existing. */
  fitment: FitmentResult
  /** Alasan fitment verbatim dari service (tampil apa adanya). */
  fitmentReason: string
}

export interface SubstituteSuggestion {
  substituteId: number
  substituteItemId: number
  substituteName: string
  substituteSku: string
  substituteUnitOfMeasure: string
  notes: string | null
  effectiveAvailableQty: number
  /** Stok pengganti juga kurang dari qty baris — tampil apa adanya, tanpa rantai saran tingkat dua. */
  substituteShortage: boolean
  fitment: FitmentResult
  fitmentReason: string
  /** incompatible = ditolak server saat terapkan; tetap tampil dengan alasan (AC-SUB69-7). */
  rejected: boolean
}

export interface SubstituteSuggestionRow {
  workOrderItemId: number
  itemId: number
  description: string | null
  qty: number
  partStatus: WorkOrderPartStatus
  issuedQty: number
  shortageQty: number
  /** Kosong = baris ini tidak dapat saran (di luar syarat BR-SUB69-03). */
  suggestions: SubstituteSuggestion[]
}

export interface SubstituteSuggestionReport {
  notice: string
  rows: SubstituteSuggestionRow[]
  /** Jumlah baris WO yang punya minimal satu saran tampil. */
  suggestedLineCount: number
}

const ELIGIBLE_STATUSES: ReadonlySet<WorkOrderPartStatus> = new Set([
  "menunggu",
  "dipesan",
])

/** Syarat tampil saran per baris (BR-SUB69-03 + AC-SUB69-2). */
export function isSubstituteSuggestionEligible(line: {
  itemId: number
  partStatus: WorkOrderPartStatus
  issuedQty: number
  shortageQty: number
}): boolean {
  if (line.itemId <= 0) return false // baris jasa: tak-tertaut, bukan item stok
  if (line.partStatus === "diganti") return false // sudah replaced — tidak dapat saran ulang
  if (line.issuedQty > 0) return false // ter-issue sebagian/penuh: guard revisi existing menolak
  return ELIGIBLE_STATUSES.has(line.partStatus) || line.shortageQty > 0
}

export function buildSubstituteSuggestions(input: {
  lines: readonly SubstituteSuggestionLineInput[]
  candidates: readonly SubstituteCandidateInput[]
}): SubstituteSuggestionReport {
  const byItem = new Map<number, SubstituteCandidateInput[]>()
  for (const candidate of input.candidates) {
    const list = byItem.get(candidate.itemId) ?? []
    list.push(candidate)
    byItem.set(candidate.itemId, list)
  }

  const rows: SubstituteSuggestionRow[] = input.lines.map((line) => {
    const base: SubstituteSuggestionRow = {
      workOrderItemId: line.workOrderItemId,
      itemId: line.itemId,
      description: line.description,
      qty: line.qty,
      partStatus: line.partStatus,
      issuedQty: line.issuedQty,
      shortageQty: line.shortageQty,
      suggestions: [],
    }
    if (!isSubstituteSuggestionEligible(line)) return base
    // Hanya relasi LANGSUNG dari item baris ini — tanpa inferensi transitif.
    const direct = byItem.get(line.itemId) ?? []
    base.suggestions = direct.map((candidate) => ({
      substituteId: candidate.substituteId,
      substituteItemId: candidate.substituteItemId,
      substituteName: candidate.substituteName,
      substituteSku: candidate.substituteSku,
      substituteUnitOfMeasure: candidate.substituteUnitOfMeasure,
      notes: candidate.notes,
      effectiveAvailableQty: candidate.effectiveAvailableQty,
      substituteShortage: candidate.effectiveAvailableQty < line.qty,
      fitment: candidate.fitment,
      fitmentReason: candidate.fitmentReason,
      rejected: candidate.fitment === "incompatible",
    }))
    return base
  })

  return {
    notice: ITEM_SUBSTITUTE_SUGGESTION_NOTICE,
    rows,
    suggestedLineCount: rows.filter((row) => row.suggestions.length > 0).length,
  }
}
