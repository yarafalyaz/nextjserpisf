// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { PurchaseRequestForm } from "../purchase-request-form"
import { mountInto, unmount, withContainer } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/purchase.actions", () => ({
  createPurchaseRequest: vi.fn().mockResolvedValue({ success: true }),
  updatePurchaseRequest: vi.fn().mockResolvedValue({ success: true }),
}))

const mockItems = [{ id: 7, sku: "BRG-7", name: "Plat Baja", unitOfMeasure: "lembar" }]
const mockEmployees = [{ id: 1, name: "Staf Gudang" }]

describe("PurchaseRequestForm — a11y", () => {
  it("form tambah berlabel + tidak sibuk + combobox item wajib", () => {
    withContainer((container) => {
      const root = mountInto(container, <PurchaseRequestForm items={mockItems} employees={mockEmployees} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Tambah permintaan pembelian")
      expect(form.getAttribute("aria-busy")).toBe("false")
      const combobox = container.querySelector('[aria-required="true"]')
      expect(combobox).not.toBeNull()
      const stars = form.querySelectorAll('span[aria-hidden="true"]')
      expect(stars.length).toBeGreaterThanOrEqual(2)
      expect(form.textContent).toContain("Item *")
      unmount(root, container)
    })
  })

  it("form ubah berlabel ubah", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <PurchaseRequestForm
          items={mockItems}
          employees={mockEmployees}
          request={{ id: 3, date: "2026-10-21", items: [{ itemId: 7, qty: 2 }] }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Ubah permintaan pembelian")
      unmount(root, container)
    })
  })
})
