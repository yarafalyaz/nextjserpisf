/**
 * `slug` backfill for the tables a fresh install populates.
 *
 * Both entry points into a new database — the first-run wizard
 * (`installBaseData`) and the seed CLI (`prisma/seed.ts`) — insert rows straight
 * through their own client and neither used to write `slug`, so every link fell
 * back to the numeric primary key (`/pengaturan/peran/2/ubah`) instead of the
 * human-readable URL. This module holds the table list and the statement so the
 * two paths cannot produce different results.
 *
 * `scripts/backfill-slugs.mjs` is the exhaustive one-off version of the same
 * pass; it also covers the transactional tables, which an install never seeds.
 */

/** Tables a fresh install populates → the column the slug derives from. */
export const INSTALL_SLUG_SOURCES: Record<string, string> = {
  roles: "name",
  users: "name",
  accounts: "name",
  warehouses: "name",
  departments: "name",
  positions: "name",
  employees: "name",
  payment_methods: "name",
  shipping_methods: "name",
  unit_of_measures: "name",
  expense_categories: "name",
  vehicle_brands: "name",
  vehicle_models: "name",
};

/** Tables that actually carry a `slug` column in the connected database. */
export const SLUG_COLUMN_QUERY =
  "SELECT table_name FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'slug'";

/** A slug stem from `column`, or NULL when it has no slug-able characters. */
function baseExpression(column: string): string {
  return `NULLIF(TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(REGEXP_REPLACE(${column}, '[^a-zA-Z0-9]+', '-'), '-+', '-'))), '')`;
}

/**
 * Statement that slugs every row of `table` that does not have one yet.
 *
 * Rows are numbered within each base-slug group so the unique index is never
 * transiently violated: the first row keeps the base, the rest get `<base>-<n>`.
 * Only `slug IS NULL` rows are touched, so it is safe to re-run and it never
 * overwrites a slug the app already assigned. Returns `null` for a table this
 * module does not know, so callers can skip rather than fly blind.
 */
export function slugBackfillSql(table: string): string | null {
  const column = INSTALL_SLUG_SOURCES[table];
  if (!column) return null;

  const base = baseExpression(column)
  return `
    UPDATE \`${table}\` t
    JOIN (
      SELECT id,
             CONCAT(base, IF(rn = 1, '', CONCAT('-', rn))) AS final_slug
      FROM (
        SELECT id,
               ${base} AS base,
               ROW_NUMBER() OVER (PARTITION BY ${base} ORDER BY id) AS rn
        FROM \`${table}\`
      ) x
      WHERE base IS NOT NULL
    ) d ON d.id = t.id
    SET t.slug = d.final_slug
    WHERE t.slug IS NULL
  `
}

/**
 * Read the table names out of `SLUG_COLUMN_QUERY`'s rows.
 *
 * `information_schema` reports its own column names in UPPERCASE
 * (`TABLE_NAME`), so the value is read positionally instead of by name —
 * reading `row.table_name` silently yields `undefined` and skips every table.
 */
export function slugTablesFromRows(rows: Array<Record<string, unknown>>): Set<string> {
  return new Set(rows.map((row) => String(Object.values(row)[0])))
}
