// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { VendorPaymentForm } from "../vendor-payment-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/purchase.actions", () => ({
  createVendorPayment: vi.fn(),
  updateVendorPayment: vi.fn(),
}))

const mockVendors = [{ id: 1, name: "Vendor A" }]

describe("VendorPaymentForm — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false; 3 bintang dekoratif; wajib saja required", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <VendorPaymentForm vendors={mockVendors} bills={[]} />,
      )
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah pembayaran pemasok")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(3)
      expect(labelTexts(form)).toEqual(
        expect.arrayContaining(["Pemasok *", "Metode Pembayaran *", "Jumlah (Rp) *"]),
      )
      // Wajib: QuickAddSelect vendorId + Combobox paymentMethod -> aria-required,
      // CurrencyInput amount -> required. Opsional tetap tanpa required.
      expect(container.querySelector("#vendorId")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#paymentMethod")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#amount")!.getAttribute("required")).not.toBeNull()
      expect(container.querySelector("#referenceNumber")!.getAttribute("required")).toBeNull()
      expect(container.querySelector("#bankAccount")!.getAttribute("required")).toBeNull()
      expect(container.querySelector("#adminFee")!.getAttribute("required")).toBeNull()
      expect(container.querySelector("#notes")!.getAttribute("required")).toBeNull()
      unmount(root, container)
    })
  })

  it("ubah: aria-label ubah pembayaran pemasok", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <VendorPaymentForm
          vendors={mockVendors}
          bills={[]}
          payment={{ id: 3, vendorId: 1, amount: 50000, date: "2026-10-21" }}
        />,
      )
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe(
        "Formulir ubah pembayaran pemasok",
      )
      unmount(root, container)
    })
  })
})
