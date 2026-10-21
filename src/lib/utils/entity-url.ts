/**
 * Entity URL helpers.
 *
 * The app routes entities by slug (see `src/lib/utils/slug.ts`). Because list
 * tables and detail pages sometimes only carry the numeric `id`, every link
 * builder funnels through here so the slug/ID decision lives in ONE place.
 *
 * During the migration some records may not yet have a slug (legacy rows). The
 * resolver accepts either a slug or a numeric id, so `entityHref` degrades
 * gracefully to the id when no slug is present.
 *
 * Canonical exception — numeric `[id]` route families: a few models have NO
 * `slug` column in `schema.prisma`, so their edit routes stay numeric by
 * design (e.g. `sdm/absensi/[id]/ubah`, `pembelian/harga-pemasok/[id]/ubah`,
 * `sdm/kalender-kerja/{libur,libur-departemen,jadwal}/[id]/ubah`). Links to them use the raw
 * id; do not "fix" them to slugs unless the model gains a slug column plus a
 * backfill.
 */

/** Minimal shape needed to build an entity href. */
export interface SluggedEntity {
  id: number
  slug?: string | null
}

/**
 * Build a detail-page href for an entity.
 *
 * @example entityHref("/master/barang", item)  // → "/master/barang/laptop-asus"
 * @example entityHref("/penjualan/faktur", inv) // → "/penjualan/faktur/inv-2026-0001"
 */
export function entityHref(basePath: string, entity: SluggedEntity): string {
  const key = entity.slug && entity.slug.length > 0 ? entity.slug : String(entity.id)
  return `${basePath}/${key}`
}

/**
 * Build an edit-page href for an entity.
 */
export function entityEditHref(basePath: string, entity: SluggedEntity): string {
  return `${entityHref(basePath, entity)}/ubah`
}

/**
 * Build an href for a child entity nested under a parent entity, e.g.
 * `/master/pelanggan/<pelanggan>/kendaraan/<kendaraan>`. Both segments use
 * the same slug-or-id rule as `entityHref`, so call sites stop hand-rolling
 * `${parent.slug ?? parent.id}` fallbacks.
 */
export function entityNestedHref(
  parentBasePath: string,
  parent: SluggedEntity,
  childSegment: string,
  child: SluggedEntity,
): string {
  const childKey = child.slug && child.slug.length > 0 ? child.slug : String(child.id)
  return `${entityHref(parentBasePath, parent)}/${childSegment}/${childKey}`
}

/**
 * True when a route segment looks like a numeric primary key. Used by the
 * resolver to decide whether to look the record up by `id` or `slug`.
 */
export function isNumericId(segment: string): boolean {
  return /^\d+$/.test(segment)
}
