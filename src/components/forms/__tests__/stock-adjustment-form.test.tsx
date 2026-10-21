// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { StockAdjustmentForm } from "../stock-adjustment-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, { get: () => ({ title: "Stub", fields: [], action: vi.fn() }) }),
}))
vi.mock("@/actions/inventory.actions", () => ({
  createStockAdjustment: vi.fn(),
  updateStockAdjustment: vi.fn(),
}))

const mockWarehouses = [{ id: 1, name: "Gudang Utama" }]
const mockItems = [
  { id: 7, sku: "BOLT-M8", name: "Baut M8", qtyOnHand: "10", cost: "1000", trackSerial: false },
]

describe("StockAdjustmentForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <StockAdjustmentForm warehouses={mockWarehouses} items={mockItems} />,
      )
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah penyesuaian stok")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(
        expect.arrayContaining(["Gudang *", "Tipe *"]),
      )
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah + Gudang required", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <StockAdjustmentForm
          warehouses={mockWarehouses}
          items={mockItems}
          adjustment={{ id: 3, warehouseId: 1, date: "2026-10-21", type: "increase" }}
        />,
      )
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe(
        "Formulir ubah penyesuaian stok",
      )
      expect(container.querySelector('[role="combobox"]')!.getAttribute("aria-required")).toBe("true")
      unmount(root, container)
    })
  })
})
