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

  it("replay payload beda: konflik definitif (AUD-R8-02)", async () => {
    const dup = Object.assign(new Error("dup"), { code: "P2002", meta: { target: "key" } })
    const tx = buildTx({
      create: vi.fn().mockRejectedValue(dup),
      findUnique: vi.fn().mockResolvedValue({
        scope: "customer_credit_refund", payloadHash: "scope=customer_credit_refund|amount=1000|creditId=1",
        resultRefType: "Journal", resultRefId: 42, createdBy: 7,
      }),
    })
    await expect(
      claimIdempotencyKey(tx, "customer_credit_refund", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab3", 7,
        "scope=customer_credit_refund|amount=2000|creditId=1"),
    ).rejects.toThrow("nominal/target berbeda")
  })

  it("replay tipe salah: ditolak (AUD-R8-03)", async () => {
    const dup = Object.assign(new Error("dup"), { code: "P2002", meta: { target: "key" } })
    const tx = buildTx({
      create: vi.fn().mockRejectedValue(dup),
      findUnique: vi.fn().mockResolvedValue({
        scope: "customer_credit_refund", payloadHash: null,
        resultRefType: "SalesPayment", resultRefId: 9, createdBy: 7,
      }),
    })
    await expect(
      claimIdempotencyKey(tx, "customer_credit_refund", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4", 7),
    ).rejects.toThrow("tidak valid")
  })

  it("record lama tanpa fingerprint: TOLAK rekonsiliasi (AUD-R9-01)", async () => {
    const dup = Object.assign(new Error("dup"), { code: "P2002", meta: { target: "key" } })
    const tx = buildTx({
      create: vi.fn().mockRejectedValue(dup),
      findUnique: vi.fn().mockResolvedValue({
        scope: "customer_credit_refund", payloadHash: null,
        resultRefType: "Journal", resultRefId: 42, createdBy: 7,
      }),
    })
    await expect(
      claimIdempotencyKey(tx, "customer_credit_refund", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab5", 7,
        "abc123digest"),
    ).rejects.toThrow("rekonsiliasi manual")
  })

  it("error dibungkus ulang = AMBIGU aman, bukan definitif palsu (AUD-R9-03)", async () => {
    const { definitive, isDefinitiveError } = await import("../financial-idempotency.service")
    const d = definitive("saldo kurang")
    expect(isDefinitiveError(d)).toBe(true)
    // Pesan dibungkus Error biasa (mis. wrapper logging) → instanceof hilang
    // → default AMBIGU (tahan key). Aman terhadap duplikasi.
    expect(isDefinitiveError(new Error(d.message))).toBe(false)
    expect(isDefinitiveError(new Error("connection lost"))).toBe(false)
  })

  it("klaim menang MENYIMPAN fingerprint; replay cocok = sukses (AUD-R10-05)", async () => {
    const { payloadFingerprint } = await import("../financial-idempotency.service")
    const fp = payloadFingerprint({ scope: "customer_credit_allocate", creditId: 1, salesInvoiceId: 101, amount: 2000 })
    const create = vi.fn().mockResolvedValue({ id: 1 })
    const tx = buildTx({ create })
    const r = await claimIdempotencyKey(tx, "customer_credit_allocate", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab6", 7, fp)
    expect(r).toEqual({ replayed: false })
    // Bukti simpan: create dipanggil dengan payloadHash = digest yang sama.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payloadHash: fp }) }),
    )
    // Replay fingerprint SAMA + scope sama + tipe+hasil valid = sukses + ref.
    const dup = Object.assign(new Error("dup"), { code: "P2002", meta: { target: "key" } })
    const tx2 = buildTx({
      create: vi.fn().mockRejectedValue(dup),
      findUnique: vi.fn().mockResolvedValue({
        scope: "customer_credit_allocate", payloadHash: fp,
        resultRefType: "SalesPayment", resultRefId: 777, createdBy: 7,
      }),
    })
    const r2 = await claimIdempotencyKey(tx2, "customer_credit_allocate", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab6", 7, fp)
    expect(r2).toEqual({ replayed: true, resultRefType: "SalesPayment", resultRefId: 777 })
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
