/**
 * Resolve a route segment (slug or numeric id) to a record.
 *
 * During — and after — the slug migration, links may carry either a slug
 * (new) or a numeric id (legacy/bookmarks). This helper lets every detail
 * page accept both without duplicating the branch logic.
 *
 * A record that has been soft-deleted must be treated as absent: callers pass
 * a `bySlug`/`byId` lookup that already filters `deletedAt: null` where
 * applicable, or they re-check afterwards.
 *
 * Usage:
 *   const item = await resolveEntity(
 *     { segment, fallbackWhere: { deletedAt: null } },
 *     {
 *       bySlug: (slug, where) => prisma.item.findFirst({ where: { slug, ...where }, include }),
 *       byId:   (id,   where) => prisma.item.findFirst({ where: { id,   ...where }, include }),
 *     },
 *   )
 */

export interface ResolveOptions<W> {
  /** The raw route segment: a slug or a numeric id. */
  segment: string
  /** Extra `where` conditions merged into both lookups (e.g. `{ deletedAt: null }`). */
  fallbackWhere?: W
}

export interface ResolveLookups<T, W> {
  bySlug: (slug: string, where: W) => Promise<T | null>
  byId: (id: number, where: W) => Promise<T | null>
}

/**
 * Resolve a segment to a record, trying slug first (the common case for
 * migrated rows), then numeric id. Returns `null` when neither matches so the
 * caller can `notFound()`.
 */
export async function resolveEntity<T, W>(
  options: ResolveOptions<W>,
  lookups: ResolveLookups<T, W>,
): Promise<T | null> {
  const { segment, fallbackWhere = {} as W } = options

  // Slug lookups always run first: slugs are never purely numeric, so a
  // numeric segment falls through to the id branch below.
  const bySlug = await lookups.bySlug(segment, fallbackWhere)
  if (bySlug) return bySlug

  if (/^\d+$/.test(segment)) {
    const byId = await lookups.byId(Number(segment), fallbackWhere)
    if (byId) return byId
  }

  return null
}
