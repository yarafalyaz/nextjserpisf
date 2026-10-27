// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

import { setupJsdomTableStubs, mountTable as mount, unmountTable as unmount } from "@/components/ui/__tests__/data-table-test-utils"

setupJsdomTableStubs()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
  usePathname: () => "/inventaris/mutasi-stok",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { permissions: [] } } }),
}))

import { StockMoveTable } from "../stock-move-table"

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  documentNo: "SM-001",
  slug: "sm-001",
  createdAt: "2026-10-22T00:00:00.000Z",
  item: { name: "Barang Uji" },
  warehouse: { name: "Gudang Utama" },
  qty: 3,
  impact: "IN",
  referenceType: "GoodsReceipt",
  referenceId: 42,
  referenceSlug: "gr-0042",
  status: "posted",
  ...overrides,
})

describe("stock-move-table — referensi dokumen sumber AC-INV-009", () => {
  it("tipe dikenal + slug: label jadi tautan slug kanonis dokumen sumber", () => {
    const { container, root } = mount(
      <StockMoveTable data={[row()]} total={1} page={1} pageSize={10} />,
    )
    const link = container.querySelector('a[href="/pembelian/penerimaan/gr-0042"]')
    expect(link).not.toBeNull()
    expect(link?.textContent).toBe("Penerimaan Barang")
    unmount(root, container)
  })

  it("tipe dikenal tanpa slug: tautan jatuh ke id numerik", () => {
    const { container, root } = mount(
      <StockMoveTable data={[row({ referenceSlug: null })]} total={1} page={1} pageSize={10} />,
    )
    const link = container.querySelector('a[href="/pembelian/penerimaan/42"]')
    expect(link).not.toBeNull()
    expect(link?.textContent).toBe("Penerimaan Barang")
    unmount(root, container)
  })

  it("tipe tanpa rute dikenal: label polos tanpa tautan", () => {
    const { container, root } = mount(
      <StockMoveTable data={[row({ referenceType: "SalesInvoiceCOGS", referenceId: 9, referenceSlug: null })]} total={1} page={1} pageSize={10} />,
    )
    expect(container.textContent).toContain("Faktur Penjualan (HPP)")
    expect(container.querySelector('a[href^="/penjualan/faktur"]')).toBeNull()
    unmount(root, container)
  })

  it("tanpa referensi: tampil '-' tanpa tautan sumber", () => {
    const { container, root } = mount(
      <StockMoveTable data={[row({ referenceType: null, referenceId: null, referenceSlug: null })]} total={1} page={1} pageSize={10} />,
    )
    expect(container.textContent).toContain("-")
    expect(container.querySelector('a[href^="/pembelian/"]')).toBeNull()
    unmount(root, container)
  })
})
