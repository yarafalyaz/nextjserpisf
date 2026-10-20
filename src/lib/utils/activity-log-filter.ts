/**
 * Shared `where` builder for the activity-log API routes
 * (`GET /api/activity-logs` and its CSV export). Both routes must apply the
 * exact same filters and reject the exact same malformed input — duplicating
 * that logic in each route is how they drift apart.
 *
 * Returns a discriminated result: `{ ok: false, message }` means the caller
 * should answer `apiError("BAD_REQUEST", message)` before touching the DB.
 * `dateTo` is widened to the end of its calendar day (inclusive), matching
 * the routes' original behaviour.
 */
export type ActivityLogWhereResult =
  | { ok: true; where: Record<string, unknown> }
  | { ok: false; message: string };

export function buildActivityLogWhere(sp: URLSearchParams): ActivityLogWhereResult {
  const where: Record<string, unknown> = {};

  const userId = sp.get("userId");
  const action = sp.get("action");
  const modelType = sp.get("modelType");
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  const search = sp.get("cari");

  if (userId && userId !== "all") {
    if (!/^\d+$/.test(userId)) return { ok: false, message: "userId tidak valid" };
    const uid = Number(userId);
    if (!Number.isSafeInteger(uid) || uid <= 0) {
      return { ok: false, message: "userId tidak valid" };
    }
    where.userId = uid;
  }
  if (action && action !== "all") where.action = action;
  if (modelType && modelType !== "all") where.modelType = modelType;

  const parsedFrom = dateFrom ? new Date(dateFrom) : null;
  const parsedTo = dateTo ? new Date(dateTo) : null;
  if (
    (parsedFrom && Number.isNaN(parsedFrom.getTime())) ||
    (parsedTo && Number.isNaN(parsedTo.getTime()))
  ) {
    return { ok: false, message: "Tanggal tidak valid" };
  }
  if (parsedFrom && parsedTo && parsedFrom.getTime() > parsedTo.getTime()) {
    return { ok: false, message: "Rentang tanggal tidak valid" };
  }
  if (parsedFrom || parsedTo) {
    const range: Record<string, Date> = {};
    if (parsedFrom) range.gte = parsedFrom;
    if (parsedTo) {
      parsedTo.setHours(23, 59, 59, 999);
      range.lte = parsedTo;
    }
    where.createdAt = range;
  }
  if (search) where.description = { contains: search };

  return { ok: true, where };
}
