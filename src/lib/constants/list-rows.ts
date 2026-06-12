/**
 * Maximum rows a list page may return in one DB query.
 *
 * This is a SAFETY CAP, not a pagination mechanism. Pages that need actual
 * pagination over larger datasets must use `parsePagination()` from
 * `@/lib/utils/pagination` and pair `findMany` with a `count()`.
 *
 * Increasing this value raises the per-request memory footprint and
 * serialization time. Keep it small for client-rendered tables.
 */
export const MAX_LIST_ROWS = 500
