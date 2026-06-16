import { describe, it, expect, vi } from "vitest"
import { deletePaymentTerm } from "../master.actions"
import { prisma } from "@/lib/db/prisma"

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn() }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    vendor: { count: vi.fn() },
    paymentTerm: { delete: vi.fn() },
  },
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

describe("deletePaymentTerm", () => {
  it("fails if vendors are tied to the payment term", async () => {
    vi.mocked(prisma.vendor.count).mockResolvedValueOnce(3)
    const res = await deletePaymentTerm(1)
    expect(res.success).toBe(false)
    expect(res.error).toContain("Syarat pembayaran")
    expect(prisma.paymentTerm.delete).not.toHaveBeenCalled()
  })

  it("deletes when no vendors reference the payment term", async () => {
    vi.mocked(prisma.vendor.count).mockResolvedValueOnce(0)
    vi.mocked(prisma.paymentTerm.delete).mockResolvedValueOnce({} as never)
    const res = await deletePaymentTerm(1)
    expect(res.success).toBe(true)
    expect(prisma.paymentTerm.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})
