import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Covers the two defects in the request-idempotency guard:
 *  - B17: keys were inserted and never removed, so the table grew forever.
 *  - B7: the key comes from the client, so a reused value blocked that request
 *    permanently (and collided across users). Keys now expire and are namespaced.
 */

const mocks = vi.hoisted(() => ({
  keyCreate: vi.fn(),
  keyFindUnique: vi.fn(),
  keyUpdate: vi.fn(),
  keyDeleteMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    idempotencyKey: {
      create: (...a: unknown[]) => mocks.keyCreate(...a),
      findUnique: (...a: unknown[]) => mocks.keyFindUnique(...a),
      update: (...a: unknown[]) => mocks.keyUpdate(...a),
      deleteMany: (...a: unknown[]) => mocks.keyDeleteMany(...a),
    },
  },
}))

import { checkIdempotency, pruneIdempotencyKeys, IDEMPOTENCY_TTL_MS } from "../idempotency"

function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.keyCreate.mockResolvedValue({})
  mocks.keyFindUnique.mockResolvedValue(null)
  mocks.keyUpdate.mockResolvedValue({})
  mocks.keyDeleteMany.mockResolvedValue({ count: 0 })
})

describe("checkIdempotency", () => {
  it("records a first-time key", async () => {
    await checkIdempotency("req-1")

    expect(mocks.keyCreate).toHaveBeenCalledWith({ data: { key: "req-1" } })
  })

  it("is a no-op for a missing or blank key", async () => {
    await checkIdempotency(null)
    await checkIdempotency(undefined)
    await checkIdempotency("   ")

    expect(mocks.keyCreate).not.toHaveBeenCalled()
  })

  it("rejects a duplicate request while the previous key is still fresh", async () => {
    mocks.keyCreate.mockRejectedValue(uniqueViolation())
    mocks.keyFindUnique.mockResolvedValue({ createdAt: new Date() })

    await expect(checkIdempotency("req-2")).rejects.toThrow(/duplikat/i)
    expect(mocks.keyUpdate).not.toHaveBeenCalled()
  })

  it("rotates a key that is older than the TTL instead of blocking forever", async () => {
    mocks.keyCreate.mockRejectedValue(uniqueViolation())
    mocks.keyFindUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 60_000),
    })

    // The old entry belongs to a finished attempt, so the request must go through.
    await expect(checkIdempotency("req-3")).resolves.toBeUndefined()
    expect(mocks.keyUpdate).toHaveBeenCalledWith({
      where: { key: "req-3" },
      data: { createdAt: expect.any(Date) },
    })
  })

  it("namespaces the key by scope so two users cannot collide", async () => {
    await checkIdempotency("same-key", undefined, 42)

    expect(mocks.keyCreate).toHaveBeenCalledWith({ data: { key: "42:same-key" } })
  })

  it("trims the key before storing it", async () => {
    await checkIdempotency("  req-4  ")

    expect(mocks.keyCreate).toHaveBeenCalledWith({ data: { key: "req-4" } })
  })

  it("propagates non-unique database errors", async () => {
    mocks.keyCreate.mockRejectedValue(new Error("connection reset"))

    await expect(checkIdempotency("req-5")).rejects.toThrow("connection reset")
  })
})

describe("pruneIdempotencyKeys", () => {
  it("deletes only rows older than the TTL", async () => {
    mocks.keyDeleteMany.mockResolvedValue({ count: 12 })

    await expect(pruneIdempotencyKeys()).resolves.toBe(12)

    const args = mocks.keyDeleteMany.mock.calls[0][0] as { where: { createdAt: { lt: Date } } }
    const ageMs = Date.now() - args.where.createdAt.lt.getTime()
    // ~24h cutoff (allow slack for test scheduling).
    expect(ageMs).toBeGreaterThan(IDEMPOTENCY_TTL_MS - 60_000)
    expect(ageMs).toBeLessThan(IDEMPOTENCY_TTL_MS + 60_000)
  })

  it("returns 0 instead of throwing when the delete fails", async () => {
    mocks.keyDeleteMany.mockRejectedValue(new Error("db down"))

    await expect(pruneIdempotencyKeys()).resolves.toBe(0)
  })
})
