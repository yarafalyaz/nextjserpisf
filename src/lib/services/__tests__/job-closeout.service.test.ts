import { describe, it, expect, vi, beforeEach } from "vitest"

// F-2026-10-21-009-V: guard biaya terpusat + syarat tutup PO.
// Falsifikasi: buat assertJobCostMutable no-op -> tes "closed ditolak" MERAH.

const { orderFindUniqueMock, woFindUniqueMock, client } = vi.hoisted(() => {
  const orderFindUniqueMock = vi.fn()
  const woFindUniqueMock = vi.fn()
  const client = {
    productionOrder: { findUnique: (...a: unknown[]) => orderFindUniqueMock(...a) },
    workOrder: { findUnique: (...a: unknown[]) => woFindUniqueMock(...a) },
  }
  return { orderFindUniqueMock, woFindUniqueMock, client }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: client }))

import {
  assertJobCostMutable,
  productionOrderCloseBlocker,
  validateCloseReason,
  validateReopenReason,
} from "../job-closeout.service"

beforeEach(() => {
  orderFindUniqueMock.mockReset()
  woFindUniqueMock.mockReset()
})

describe("assertJobCostMutable", () => {
  it("PO closed ditolak", async () => {
    orderFindUniqueMock.mockResolvedValue({ status: "closed", workOrderId: 9 })
    await expect(assertJobCostMutable({ productionOrderId: 55 }, "ditambahkan", client as never))
      .rejects.toThrow(/sudah ditutup \(closed\)/)
    expect(woFindUniqueMock).not.toHaveBeenCalled()
  })

  it("WO closed membekukan PO anak yang masih completed", async () => {
    orderFindUniqueMock.mockResolvedValue({ status: "completed", workOrderId: 9 })
    woFindUniqueMock.mockResolvedValue({ status: "closed" })
    await expect(assertJobCostMutable({ productionOrderId: 55 }, "diubah", client as never))
      .rejects.toThrow(/perintah kerja sudah ditutup/)
  })

  it("WO-only closed ditolak", async () => {
    woFindUniqueMock.mockResolvedValue({ status: "closed" })
    await expect(assertJobCostMutable({ workOrderId: 9 }, "ditambahkan", client as never))
      .rejects.toThrow(/sudah ditutup \(closed\)/)
  })

  it("job terbuka lolos", async () => {
    orderFindUniqueMock.mockResolvedValue({ status: "in_progress", workOrderId: 9 })
    woFindUniqueMock.mockResolvedValue({ status: "in_progress" })
    await expect(assertJobCostMutable({ productionOrderId: 55, workOrderId: 9 }, "ditambahkan", client as never))
      .resolves.toBeUndefined()
  })

  it("tanpa target = lolos tanpa query", async () => {
    await expect(assertJobCostMutable({}, "ditambahkan", client as never)).resolves.toBeUndefined()
    expect(orderFindUniqueMock).not.toHaveBeenCalled()
    expect(woFindUniqueMock).not.toHaveBeenCalled()
  })
})

describe("productionOrderCloseBlocker", () => {
  const base = { status: "completed", qty: 10, completedQty: 10, totalActualCost: 0 }

  it("lolos: completed + qty penuh + sisa 0,00", () => {
    expect(productionOrderCloseBlocker(base)).toEqual({ ok: true })
  })

  it("sisa WIP Rp0,01 ditolak menyebut nominal (tanpa ambang)", () => {
    const r = productionOrderCloseBlocker({ ...base, totalActualCost: 0.01 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("0.01")
  })

  it("completedQty < qty ditolak", () => {
    const r = productionOrderCloseBlocker({ ...base, completedQty: 9 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("belum selesai penuh")
  })

  it("status bukan completed ditolak", () => {
    const r = productionOrderCloseBlocker({ ...base, status: "in_progress" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("hanya dapat ditutup dari status 'completed'")
  })
})

describe("alasan tutup/reopen", () => {
  it("reopen tanpa alasan / spasi ditolak", () => {
    expect(validateReopenReason(undefined)).toEqual({ error: expect.stringContaining("wajib") })
    expect(validateReopenReason("   ")).toEqual({ error: expect.stringContaining("wajib") })
  })
  it("tutup tanpa alasan ditolak", () => {
    expect(validateCloseReason("")).toEqual({ error: expect.stringContaining("wajib") })
  })
  it("alasan valid di-trim", () => {
    expect(validateReopenReason("  koreksi biaya  ")).toBe("koreksi biaya")
    expect(validateCloseReason(" selesai ")).toBe("selesai")
  })
})
