import { prisma } from "@/lib/db/prisma"

/**
 * Idempotency guard for mutations that must never be applied twice (double click,
 * retried fetch, browser resubmit).
 *
 * Design notes
 *  - The key is recorded through the caller's transaction, so a rolled-back
 *    mutation releases its key automatically instead of blocking a retry.
 *  - Keys EXPIRE (`IDEMPOTENCY_TTL_MS`). The key is supplied by the client, so a
 *    client that (accidentally or maliciously) reuses one constant value would
 *    otherwise block that operation forever. On conflict we compare the existing
 *    row's age: still fresh -> real duplicate; older than the TTL -> rotate and
 *    let the request through.
 *  - `scope` (normally the user id) namespaces the key, so two users can never
 *    collide on the same client-supplied value.
 *
 * The `idempotency_keys` table is pruned by `pruneIdempotencyKeys()` (daily cron
 * plus an opportunistic sweep here) so it stays bounded - previously rows were
 * inserted and never removed.
 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

type IdempotencyDb = {
  idempotencyKey: {
    create: (args: { data: { key: string } }) => Promise<unknown>
    findUnique: (args: {
      where: { key: string }
      select: { createdAt: true }
    }) => Promise<{ createdAt: Date } | null>
    update: (args: { where: { key: string }; data: { createdAt: Date } }) => Promise<unknown>
  }
}

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002"
}

export async function checkIdempotency(
  key: string | null | undefined,
  txClient?: unknown,
  scope?: string | number,
) {
  const trimmed = key?.trim()
  if (!trimmed) return

  const db = (txClient ?? prisma) as unknown as IdempotencyDb
  const scopedKey =
    scope !== undefined && scope !== null && String(scope) !== "" ? `${scope}:${trimmed}` : trimmed
  const staleBefore = new Date(Date.now() - IDEMPOTENCY_TTL_MS)

  try {
    await db.idempotencyKey.create({ data: { key: scopedKey } })
  } catch (e) {
    if (!isUniqueViolation(e)) throw e

    const existing = await db.idempotencyKey.findUnique({
      where: { key: scopedKey },
      select: { createdAt: true },
    })

    // Fresh duplicate: two submissions of the same request are in flight/processed.
    if (existing && existing.createdAt >= staleBefore) {
      throw new Error("Permintaan duplikat terdeteksi. Transaksi ini sedang atau telah diproses.")
    }

    // Stale entry: the earlier attempt is long gone, so re-claim the key.
    await db.idempotencyKey.update({ where: { key: scopedKey }, data: { createdAt: new Date() } })
    return
  }

  void maybePrune()
}

/** Delete keys older than the TTL. Safe to call at any time (idempotent). */
export async function pruneIdempotencyKeys(): Promise<number> {
  try {
    const res = await prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) } },
    })
    return res.count
  } catch (e) {
    console.error("[idempotency] prune gagal:", e)
    return 0
  }
}

let lastPruneAt = 0
const PRUNE_INTERVAL_MS = 60 * 60 * 1000

/**
 * Opportunistic sweep, at most once per hour per process. Runs on the global
 * client (outside the caller's transaction) and only ever deletes rows that are
 * already past the TTL, so it can never remove a key belonging to an in-flight
 * request.
 */
async function maybePrune(): Promise<void> {
  const now = Date.now()
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return
  lastPruneAt = now
  await pruneIdempotencyKeys()
}
