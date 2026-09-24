import { Prisma } from "@prisma/client"

/**
 * Soft-delete read filter.
 *
 * Deleting a master falls back to a soft delete (`deletedAt`) when a foreign key
 * blocks the hard delete, and `bulkDelete` soft-deletes every model that has the
 * column. List pages and pickers that forgot `where: { deletedAt: null }` then
 * kept showing - and offering for selection - rows the user had just deleted
 * (that was bug class B4/B5/B29).
 *
 * Instead of relying on every future query to remember the filter, `prisma` in
 * ./prisma wraps `findMany` and `count` and injects `deletedAt: null` for models
 * that declare the column.
 *
 * Deliberate boundaries:
 *  - Only `findMany` and `count` are wrapped. `findUnique`/`findFirst` are left
 *    alone because they are widely used for uniqueness checks ("is this code
 *    taken?"), which MUST see soft-deleted rows - otherwise a new record could
 *    reuse the code of a deleted one and hit the DB unique constraint.
 *  - `aggregate`/`groupBy` are left alone: reports over accounts must keep
 *    counting postings of deactivated accounts or the trial balance breaks.
 *  - An explicit `deletedAt` in the caller's `where` always wins, so intentional
 *    reads of deleted rows (and the pages already filtering) are unaffected.
 *  - Use `basePrisma` for any query that must bypass the filter entirely.
 */

/** Models whose schema declares `deletedAt`, from the runtime DMMF. */
export const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "deletedAt"))
    .map((model) => model.name),
)

type ListArgs = { where?: Record<string, unknown> } | undefined

/**
 * Return `args` with `deletedAt: null` merged into `where` for soft-deletable
 * models. Returns the arguments untouched when the model has no `deletedAt`
 * column or the caller already constrained `deletedAt` explicitly.
 */
export function withSoftDeleteFilter<T extends ListArgs>(model: string, args: T): T {
  if (!SOFT_DELETE_MODELS.has(model)) return args

  const where = args?.where
  if (where && "deletedAt" in where) return args

  // The result is the caller's args plus one `where` key; Prisma validates the
  // final shape at query time, so narrowing back through `unknown` is safe here.
  return { ...(args ?? {}), where: { ...(where ?? {}), deletedAt: null } } as unknown as T
}
