// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { PRICE_LIST_EXPIRY_STATUS_LABELS } from "@/lib/services/customer-price-list.service"
import { CustomerPriceForm } from "../_components/customer-price-form"
import { CustomerPriceTable } from "../_components/customer-price-table"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/penjualan/harga-pelanggan",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { permissions: ["delete_customer_price_lists"] } } }),
}))
vi.mock("@/actions/customer-price-list.actions", () => ({
  createCustomerPriceList: vi.fn().mockResolvedValue({ success: true }),
  updateCustomerPriceList: vi.fn().mockResolvedValue({ success: true }),
  deleteCustomerPriceList: vi.fn().mockResolvedValue({ success: true }),
}))

function render(container: HTMLElement, ui: React.ReactNode) {
  const root: Root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return root
}

const categories = [{ value: "2", label: "Kontraktor" }]
const items = [{ value: "7", label: "BRG-001 — Semen", unit: "SAK" }]

describe("CustomerPriceForm (AC-B2-1)", () => {
  it("tambah: aria-label/busy, wajib aria-required, label satuan dinamis, bintang dekoratif", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(
      container,
      <CustomerPriceForm categoryOptions={categories} itemOptions={items} />,
    )
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah daftar harga pelanggan")
    expect(form.getAttribute("aria-busy")).toBe("false")
    expect(form.querySelectorAll('span[aria-hidden="true"].text-destructive').length).toBe(3)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(
      expect.arrayContaining(["Kategori Pelanggan", "Barang *", "Harga (Rp) *", "Minimal Qty *"]),
    )
    expect(labels.join(" ")).not.toContain("SAK")
    expect(labels.join(" ")).toContain("Berlaku Sampai")
    expect(container.querySelector("#submit-customer-price")?.textContent).toBe("Simpan")
    act(() => root.unmount())
    container.remove()
  })

  it("ubah: aria-label ubah + nilai awal terisi", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(
      container,
      <CustomerPriceForm
        categoryOptions={categories}
        itemOptions={items}
        initial={{
          id: 5,
          customerCategoryId: "2",
          itemId: "7",
          price: "125000",
          minQty: "10",
          effectiveDate: "2026-01-01",
          expiresAt: "2026-12-31",
          notes: "Promo",
        }}
      />,
    )
    expect(container.querySelector("form")!.getAttribute("aria-label")).toBe(
      "Formulir ubah daftar harga pelanggan",
    )
    expect(container.querySelector("#submit-customer-price")?.textContent).toBe("Simpan Perubahan")
    expect(container.querySelector<HTMLTextAreaElement>("#notes")?.value).toBe("Promo")
    act(() => root.unmount())
    container.remove()
  })
})

describe("CustomerPriceTable (AC-B2-1)", () => {
  const baseRow = {
    id: 1,
    categoryName: "Kontraktor",
    itemLabel: "BRG-001 — Semen",
    unit: "SAK",
    minQty: 10,
    price: 125000,
    effectiveDate: "2026-01-15T00:00:00.000Z",
    expiresAt: null as string | null,
    expiryStatus: "tanpa_batas",
    expiryStatusLabel: PRICE_LIST_EXPIRY_STATUS_LABELS.tanpa_batas,
    notes: null as string | null,
  }

  it("baris: kategori/umum, minQty + satuan, Rupiah, tanggal Indonesia", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(
      container,
      <CustomerPriceTable
        data={[
          baseRow,
          {
            ...baseRow,
            id: 2,
            categoryName: "Umum",
            itemLabel: "BRG-002 — Pasir",
            unit: "M3",
            minQty: 1,
            price: 250000,
            effectiveDate: null,
            notes: "Dasar",
          },
        ]}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Kontraktor")
    expect(text).toContain("Umum")
    expect(text).toContain("10 SAK")
    expect(text).toContain("Rp 125.000")
    expect(text).toContain("15 Januari 2026")
    expect(text).toContain("Berlaku Sampai")
    expect(text).toContain(PRICE_LIST_EXPIRY_STATUS_LABELS.tanpa_batas)
    expect(container.querySelector('[aria-label="Daftar harga pelanggan"]')).not.toBeNull()
    act(() => root.unmount())
    container.remove()
  })

  it("AC-PX-F2: baris sudah berakhir tetap tampil berlabel + kolom Berlaku Sampai", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(
      container,
      <CustomerPriceTable
        data={[
          {
            ...baseRow,
            expiresAt: "2026-09-30T00:00:00.000Z",
            expiryStatus: "sudah_berakhir",
            expiryStatusLabel: PRICE_LIST_EXPIRY_STATUS_LABELS.sudah_berakhir,
          },
        ]}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("BRG-001 — Semen")
    expect(text).toContain(PRICE_LIST_EXPIRY_STATUS_LABELS.sudah_berakhir)
    expect(text).toContain("30 September 2026")
    act(() => root.unmount())
    container.remove()
  })

  it("antrean segera berakhir tampil bila ada baris", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const expiring = {
      ...baseRow,
      id: 3,
      itemLabel: "BRG-003 — Besi",
      expiresAt: "2026-11-10T00:00:00.000Z",
      expiryStatus: "segera_berakhir",
      expiryStatusLabel: PRICE_LIST_EXPIRY_STATUS_LABELS.segera_berakhir,
    }
    const root = render(container, <CustomerPriceTable data={[baseRow]} expiringRows={[expiring]} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Segera Berakhir")
    expect(text).toContain(PRICE_LIST_EXPIRY_STATUS_LABELS.segera_berakhir)
    expect(text).toContain("BRG-003 — Besi")
    expect(container.querySelector('[aria-label="Harga segera berakhir"]')).not.toBeNull()
    act(() => root.unmount())
    container.remove()
  })

  it("kosong: state kosong tampil", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(container, <CustomerPriceTable data={[]} />)
    expect(container.textContent ?? "").not.toContain("Rp ")
    act(() => root.unmount())
    container.remove()
  })
})
