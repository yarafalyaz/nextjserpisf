/**
 * Build the "Satuan" dropdown options for the item form from the UoM master
 * (`/master/satuan`). Previously the item form hard-coded PCS/SET/KG/LTR/MTR/
 * BOX, so adding a unit in the master had no effect on the form — the two were
 * disconnected.
 *
 * The stored value is the master's `symbol` (not `name`), because
 * `Item.unitOfMeasure` already holds short codes ("PCS", "BOX") and the same
 * code is used as `UomConversion.code` for alternative units. Storing the long
 * name would break both.
 *
 * Two guards keep existing data safe:
 *  - a unit already saved on an item but no longer present (or renamed) in the
 *    master is kept at the top of the list, so opening the edit form never
 *    silently blanks/replaces the item's unit;
 *  - when the master is empty (fresh install), the historical built-in list is
 *    still offered so the form remains usable.
 *
 * Pure function: no DB, no React — trivially unit-testable.
 */

/** Fallback list used only when the UoM master has no active rows. */
export const DEFAULT_UOM_OPTIONS = ["PCS", "SET", "KG", "LTR", "MTR", "BOX"] as const

export interface UomMasterEntry {
  name: string
  symbol: string
}

export interface UomOption {
  value: string
  label: string
}

export function buildUomOptions(
  units: readonly UomMasterEntry[] | null | undefined,
  current?: string | null,
): UomOption[] {
  const options: UomOption[] = []
  const seen = new Set<string>()

  // Symbols are normalized to UPPERCASE because the app already stores short
  // uppercase codes on `Item.unitOfMeasure` (default "PCS") and on
  // `UomConversion.code` (e.g. "BOX"). A master row typed as "Pcs" must match
  // those, not create a look-alike option. Dedup is case-insensitive too.
  const normalize = (raw: unknown): string => String(raw ?? "").trim().toUpperCase()

  for (const unit of units ?? []) {
    const value = normalize(unit?.symbol)
    if (!value || seen.has(value)) continue
    seen.add(value)
    const name = String(unit?.name ?? "").trim()
    options.push({
      value,
      label: name && name.toUpperCase() !== value ? `${value} — ${name}` : value,
    })
  }

  if (options.length === 0) {
    for (const symbol of DEFAULT_UOM_OPTIONS) {
      options.push({ value: symbol, label: symbol })
      seen.add(symbol)
    }
  }

  // Keep a legacy/current value that the master no longer lists.
  const currentValue = normalize(current)
  if (currentValue && !seen.has(currentValue)) {
    options.unshift({ value: currentValue, label: currentValue })
  }

  return options
}
