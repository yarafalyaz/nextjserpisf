// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/pembelian/harga-pemasok",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { permissions: ["delete_vendor_prices"] } } }),
}))
vi.mock("@/actions/vendor-price.actions", () => ({
  createVendorPrice: vi.fn().mockResolvedValue({ success: true }),
  updateVendorPrice: vi.fn().mockResolvedValue({ success: true }),
  deleteVendorPrice: vi.fn().mockResolvedValue({ success: true }),
}))

import { VendorPriceTable } from "../_components/vendor-price-table"

function render(ui: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return { container, root }
}

const row = {
  id: 5,
  vendorName: "CV Sumber Bangunan",
  itemLabel: "BRG-001 — Semen",
  minQty: 10,
  price: 62000,
  effectiveDate: null as string | null,
}

/**
 * Regresi putaran 224: halaman daftar hanya menuntut view_vendor_prices,
 * sedangkan halaman `/[id]/ubah` menuntut edit_vendor_prices lalu
 * redirect("/") saat gagal. Tautan Ubah tanpa gerbang mengantar peran
 * lihat-saja ke dasbor tanpa pesan.
 */
describe("VendorPriceTable — gerbang tautan Ubah", () => {
  it("canEdit=false menyembunyikan tautan Ubah", () => {
    const { container, root } = render(<VendorPriceTable data={[row]} canEdit={false} />)
    expect(container.querySelector('a[href$="/ubah"]')).toBeNull()
    act(() => root.unmount())
    container.remove()
  })

  it("canEdit=true menampilkan tautan Ubah ke halaman ubah", () => {
    const { container, root } = render(<VendorPriceTable data={[row]} canEdit />)
    const link = container.querySelector('a[href="/pembelian/harga-pemasok/5/ubah"]')
    expect(link?.textContent).toContain("Ubah")
    act(() => root.unmount())
    container.remove()
  })

  it("default prop fail-closed", () => {
    const { container, root } = render(<VendorPriceTable data={[row]} />)
    expect(container.querySelector('a[href$="/ubah"]')).toBeNull()
    act(() => root.unmount())
    container.remove()
  })
})
