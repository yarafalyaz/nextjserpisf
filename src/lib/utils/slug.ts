/**
 * Slug utilities.
 *
 * URLs across the app identify records by a human-readable slug derived from
 * a display name (master data) or document number (transactions) rather than
 * the numeric primary key. Slugs are stored on the row (`slug` column) so the
 * route can resolve them with a single indexed lookup, and so they remain
 * stable even if the source name changes later.
 *
 * Collisions (two entities with the same name) are resolved by appending a
 * numeric suffix: `avanza`, `avanza-2`, `avanza-3`, ...
 */

/**
 * Turn arbitrary text into a URL-safe slug.
 *
 * - lowercases
 * - strips diacritics (é → e)
 * - replaces any run of non [a-z0-9] characters with a single hyphen
 * - trims leading/trailing hyphens and collapses repeats
 *
 * Returns `""` when the input has no slug-able characters (caller should fall
 * back to a stable identifier in that case).
 */
export function slugify(input: string | null | undefined): string {
  if (input === null || input === undefined) return ""
  return input
    .normalize("NFKD")
    // Remove combining diacritical marks.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

/**
 * Build a unique slug from `base`, given a predicate that reports whether a
 * candidate slug is already taken. Appends `-2`, `-3`, ... until a free slug
 * is found.
 *
 * `base` is slugified first; if that yields an empty string, `fallback` (e.g.
 * a document number or the id) is used as the stem so we never persist "".
 */
export async function buildUniqueSlug(
  base: string | null | undefined,
  isTaken: (candidate: string) => Promise<boolean>,
  fallback = "item",
): Promise<string> {
  const stem = slugify(base) || slugify(fallback) || "item"

  if (!(await isTaken(stem))) return stem

  let n = 2
  // The loop is bounded in practice (collisions are rare); guard with a large
  // ceiling so a pathological predicate can't spin forever.
  while (n < 10_000) {
    const candidate = `${stem}-${n}`
    if (!(await isTaken(candidate))) return candidate
    n += 1
  }
  // Extremely unlikely fallback: attach a timestamp to guarantee uniqueness.
  return `${stem}-${Date.now()}`
}
