import { describe, it, expect, vi } from "vitest"
import {
  claimIdempotencyKey,
  bindIdempotencyKey,
  type IdemTx,
} from "../financial-idempotency.service"

function buildTx(over: Partial<{ create: unknown; findUnique: unknown; update: unknown }> = {}): IdemTx {
  return {
    financialIdempotencyKey: {
      create: (over.create ?? vi.fn().mockResolvedValue({ id: 1 })) as never,
      findUnique: (over.findUnique ?? vi.fn().mockResolvedValue(null)) as never,
      update: (over.update ?? vi.fn().mockResolvedValue({})) as never,
    },
  }
}

/**
 * AUD-R7-02/R7-06: kontrak claim — hanya P2002 constraint key = replay;
 * scope beda/gantung/null = error; error lain dilempar.
 */
describe("financial-idempotency.service", () => {
  it("klaim baru menang: replayed false", async () => {
    const r = await claimIdempotencyKey(buildTx(), "customer_credit_refund", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9", 7)
    expect(r).toEqual({ replayed: false })
  })

  it("key cacat/entah: ditolak sebelum DB", async () => {
    const create = vi.fn()
    const tx = buildTx({ create })
    await expect(claimIdempotencyKey(tx, "customer_credit_refund", "x!!", 7)).rejects.toThrow("tidak valid")
    expect(create).not.toHaveBeenCalled()
  })

  it("P2002 BUKAN constraint key: dilempar (bukan replay)", async () => {
    const other = Object.assign(new Error("Unique constraint failed on the fields: (`document_no`)"), {
      code: "P2002",
      meta: { target: "document_no" },
    })
    const tx = buildTx({ create: vi.fn().mockRejectedValue(other) })
    await expect(
      claimIdempotencyKey(tx, "customer_credit_refund", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab0", 7),
    ).rejects.toThrow("document_no")
  })

  it("error non-P2002: dilempar", async () => {
    const tx = buildTx({ create: vi.fn().mockRejectedValue(new Error("connection lost")) })
    await expect(
      claimIdempotencyKey(tx, "customer_credit_refund", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1", 7),
    ).rejects.toThrow("connection lost")
  })

  it("bind menulis ref hasil", async () => {
    const update = vi.fn().mockResolvedValue({})
    await bindIdempotencyKey(buildTx({ update }), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab2", "Journal", 42)
    expect(update).toHaveBeenCalledWith({
      where: { key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab2" },
      data: { resultRefType: "Journal", resultRefId: 42 },
    })
  })
})
