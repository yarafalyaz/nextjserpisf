import { describe, it, expect, vi, beforeEach } from "vitest"

// document-scope.ts memakai `import "server-only"` yang melempar di luar
// lingkungan react-server — stub yang sama seperti test attachment-permissions.
vi.mock("server-only", () => ({}))

// Modul ini juga mengimpor `auth` (NextAuth) untuk varian halaman; rantai
// next-auth memuat `next/server` yang tidak resolvable di test env. Fungsi yang
// diuji di sini menerima sesi secara eksplisit, jadi auth cukup di-stub.
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn(async () => null) }))

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  getWarehouseScope: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    goodsReceipt: { findUnique: mocks.findUnique },
    inventoryTransfer: { findUnique: mocks.findUnique },
    materialIssue: { findUnique: mocks.findUnique },
    stockAdjustment: { findUnique: mocks.findUnique },
  },
}))

// Hanya getWarehouseScope yang di-mock; assertWarehouseAccessMulti tetap yang
// asli supaya logika cakupannya benar-benar diuji, bukan tiruan.
vi.mock("@/lib/auth/warehouse-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/warehouse-scope")>()
  return { ...actual, getWarehouseScope: (...args: unknown[]) => mocks.getWarehouseScope(...args) }
})

import { canAccessWarehouseScopedDocument } from "../document-scope"

const session = { user: { id: "7", roles: ["warehouse"] } }

describe("canAccessWarehouseScopedDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("meloloskan dokumen yang memang tidak dibatasi gudang", async () => {
    // Tanpa sesi pun true: dokumennya tidak terikat penugasan gudang.
    expect(await canAccessWarehouseScopedDocument("quotation", 1, null)).toBe(true)
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  // Inti perbaikan IDOR cetak: dokumen gudang lain tidak boleh diakses.
  it("menolak dokumen di gudang di luar penugasan", async () => {
    mocks.getWarehouseScope.mockResolvedValue({ kind: "assigned", warehouseIds: [2] })
    mocks.findUnique.mockResolvedValue({ id: 5, warehouseId: 1 })
    expect(await canAccessWarehouseScopedDocument("goods_receipt", 5, session)).toBe(false)
  })

  it("mengizinkan dokumen di gudang yang ditugaskan", async () => {
    mocks.getWarehouseScope.mockResolvedValue({ kind: "assigned", warehouseIds: [2] })
    mocks.findUnique.mockResolvedValue({ id: 5, warehouseId: 2 })
    expect(await canAccessWarehouseScopedDocument("goods_receipt", 5, session)).toBe(true)
  })

  it("mengizinkan semua gudang untuk cakupan 'all'", async () => {
    mocks.getWarehouseScope.mockResolvedValue({ kind: "all" })
    mocks.findUnique.mockResolvedValue({ id: 5, warehouseId: 99 })
    expect(await canAccessWarehouseScopedDocument("goods_receipt", 5, session)).toBe(true)
  })

  // Transfer punya DUA gudang; satu saja di luar penugasan harus ditolak.
  it("menolak transfer bila salah satu gudangnya di luar penugasan", async () => {
    mocks.getWarehouseScope.mockResolvedValue({ kind: "assigned", warehouseIds: [2] })
    mocks.findUnique.mockResolvedValue({ id: 9, sourceWarehouseId: 1, destinationWarehouseId: 2 })
    expect(await canAccessWarehouseScopedDocument("inventory_transfer", 9, session)).toBe(false)
  })

  it("fail-closed: tanpa sesi, dokumen hilang, atau kolom gudang kosong", async () => {
    mocks.getWarehouseScope.mockResolvedValue({ kind: "all" })
    expect(await canAccessWarehouseScopedDocument("goods_receipt", 5, null)).toBe(false)

    mocks.findUnique.mockResolvedValue(null)
    expect(await canAccessWarehouseScopedDocument("goods_receipt", 5, session)).toBe(false)

    mocks.findUnique.mockResolvedValue({ id: 5, warehouseId: null })
    expect(await canAccessWarehouseScopedDocument("goods_receipt", 5, session)).toBe(false)
  })
})
