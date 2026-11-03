import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  accountFindManyMock: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: { findFirst: mocks.findFirstMock },
    account: { findMany: mocks.accountFindManyMock },
  },
}))

import { loadSettingsForEdit } from "@/app/(dashboard)/pengaturan/ubah/_lib/load-settings"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findFirstMock.mockResolvedValue({ id: 9 })
  mocks.accountFindManyMock.mockResolvedValue([
    { id: 1, code: "1000", name: "Aset", type: "ASSET", _count: { children: 2 } },
    { id: 2, code: "1101", name: "Kas", type: "ASSET", _count: { children: 0 } },
  ])
})

describe("loadSettingsForEdit putaran 94", () => {
  it("picker hanya akun leaf: induk dikeluarkan, query memakai deletedAt null", async () => {
    const { accounts } = await loadSettingsForEdit()
    expect(accounts).toEqual([{ id: 2, code: "1101", name: "Kas", type: "ASSET" }])
    expect(mocks.accountFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, deletedAt: null },
      }),
    )
  })
})
