import { describe, it, expect, vi } from "vitest"

// Page RSC menyeret rantai Prisma/auth yang tidak bisa dimuat vitest; yang
// diuji di sini hanya pemetaan status -> label (§6), bukan isi halamannya.
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(),
  hasPermission: vi.fn(),
}))
vi.mock("@/lib/auth/document-scope", () => ({
  canViewWarehouseScopedDocument: vi.fn(),
}))
vi.mock("@/lib/utils/resolve-entity", () => ({ resolveEntity: vi.fn() }))
vi.mock("@/actions/inventory.actions", () => ({
  deleteInventoryTransfer: vi.fn(),
  processInventoryTransfer: vi.fn(),
}))
vi.mock("next/navigation", () => ({ notFound: vi.fn() }))

import { transferStatusLabel } from "../page"
import { statusLabel } from "@/lib/utils/status-labels"

describe("transferStatusLabel — label status detail F-2026-10-22-081-S §6 (LOW-2)", () => {
  it('processed -> "Dalam Perjalanan"', () => {
    expect(transferStatusLabel("processed")).toBe("Dalam Perjalanan")
  })

  it("status lain tanpa label khusus (fallback STATUS_LABELS lewat StatusChip)", () => {
    expect(transferStatusLabel("partially_received")).toBeUndefined()
    expect(transferStatusLabel("draft")).toBeUndefined()
    expect(transferStatusLabel("completed")).toBeUndefined()
  })

  it('partially_received -> "Diterima Sebagian" dari STATUS_LABELS satu sumber', () => {
    expect(statusLabel("partially_received")).toBe("Diterima Sebagian")
  })
})
