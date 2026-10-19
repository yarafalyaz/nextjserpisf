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
  keyUpdateMany: vi.fn(),
  keyDeleteMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    idempotencyKey: {
      create: (...a: unknown[]) => mocks.keyCreate(...a),
      findUnique: (...a: unknown[]) => mocks.keyFindUnique(...a),
      updateMany: (...a: unknown[]) => mocks.keyUpdateMany(...a),
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
  mocks.keyUpdateMany.mockResolvedValue({ count: 1 })
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
    expect(mocks.keyUpdateMany).not.toHaveBeenCalled()
  })

  it("rotates a key that is older than the TTL instead of blocking forever", async () => {
    mocks.keyCreate.mockRejectedValue(uniqueViolation())
    mocks.keyFindUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 60_000),
    })

    // The old entry belongs to a finished attempt, so the request must go through.
    await expect(checkIdempotency("req-3")).resolves.toBeUndefined()
    expect(mocks.keyUpdateMany).toHaveBeenCalledWith({
      where: { key: "req-3", createdAt: { lt: expect.any(Date) } },
      data: { createdAt: expect.any(Date) },
    })
  })

  it("rejects the loser when two requests reclaim a stale key at once (P1-8)", async () => {
    // Pemenang: updateMany bersyarat kena 1 baris → lolos.
    mocks.keyCreate.mockRejectedValue(uniqueViolation())
    mocks.keyFindUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 60_000),
    })
    mocks.keyUpdateMany.mockResolvedValue({ count: 1 })
    await expect(checkIdempotency("req-race")).resolves.toBeUndefined()

    // Pecundang: baris sudah direbut (tak lagi stale) → count 0 → duplikat.
    mocks.keyUpdateMany.mockResolvedValue({ count: 0 })
    await expect(checkIdempotency("req-race")).rejects.toThrow(/duplikat/i)
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
