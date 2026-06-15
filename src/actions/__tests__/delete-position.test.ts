import { describe, it, expect, vi } from "vitest"
import { deletePosition } from "../master.actions"
import { prisma } from "@/lib/db/prisma"

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn() }))
vi.mock("@/lib/db/prisma", () => ({ prisma: { employee: { count: vi.fn() }, position: { delete: vi.fn() } } }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

describe("deletePosition", () => {
  it("fails if active employees are tied to the position", async () => {
    vi.mocked(prisma.employee.count).mockResolvedValueOnce(2)
    const res = await deletePosition(1)
    expect(res).toEqual({ success: false, error: "Jabatan masih memiliki 2 karyawan aktif" })
  })
})
