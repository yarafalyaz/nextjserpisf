/**
 * Parse a user-typed money amount into a number.
 *
 * Accepts the shapes that actually reach the server from form inputs, mixing
 * the Indonesian convention (`.` thousands, `,` decimal) with the
 * programmer convention (`.` decimal):
 *
 *   "2000000"      -> 2000000
 *   "2.000.000"    -> 2000000
 *   "2.000.000,50" -> 2000000.5
 *   "2000000.50"   -> 2000000.5
 *   "2,5"          -> 2.5
 *   ""             -> null
 *
 * The ambiguity is a single dot: "2.000" is read as two thousand (three digits
 * after the dot, id-ID thousands), while "2.5" stays a decimal. Before this
 * helper, "2.000.000" fell through to `Number("2.000.000") === 2`.
 */
/**
 * Parse a user-typed quantity/number with the same id-ID shapes as
 * parseMoneyAmount, plus a fallback for empty input (e.g. minQty defaults to
 * 1 when the field is left blank). Before this helper, local copies of the
 * normalization lived in each action file and drifted apart.
 */
export function parseLocaleNumber(
  raw: FormDataEntryValue | string | number | null | undefined,
  fallback: number | null = null,
): number | null {
  const text = String(raw ?? "").trim()
  if (!text) return fallback

  let normalized = text
  if (text.includes(",")) {
    normalized = text.replace(/\./g, "").replace(",", ".")
  } else {
    const dots = (text.match(/\./g) || []).length
    if (dots > 1) {
      normalized = text.replace(/\./g, "")
    } else if (dots === 1 && /\.\d{3}$/.test(text)) {
      normalized = text.replace(/\./g, "")
    }
  }

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function parseMoneyAmount(raw: FormDataEntryValue | string | number | null | undefined): number | null {
  return parseLocaleNumber(raw)
}
