// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

// Radix (Combobox/Dialog) pakai ResizeObserver; jsdom tidak punya.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver

import { VendorPaymentForm } from "../vendor-payment-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/purchase.actions", () => ({
  createVendorPayment: vi.fn().mockResolvedValue({ success: true }),
  updateVendorPayment: vi.fn().mockResolvedValue({ success: true }),
}))

describe("VendorPaymentForm — a11y wiring", () => {
  it("aria-label tambah + busy false; 3 bintang dekoratif di Label; wajib aria-required, opsional bersih", () => {
    withContainer((container) => {
      const root = mountInto(container, <VendorPaymentForm vendors={[{ id: 1, name: "Pemasok A" }]} bills={[]} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah pembayaran pemasok")
      expect(form.getAttribute("aria-busy")).toBe("false")
      // 3 bintang Label; label AppDatePicker "Tanggal Bayar *" string bersama di luar cakupan.
      expect(decorativeStars(form).length).toBe(3)
      expect(labelTexts(form)).toEqual(
        expect.arrayContaining(["Pemasok *", "Metode Pembayaran *", "Jumlah (Rp) *", "No. Referensi", "No. Rekening", "Catatan"]),
      )
      expect(container.querySelector("#vendorId")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#paymentMethod")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#paymentDate-trigger")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#amount")!.hasAttribute("required")).toBe(true)
      expect(container.querySelector("#referenceNumber")!.hasAttribute("required")).toBe(false)
      expect(container.querySelector("#bankAccount")!.hasAttribute("required")).toBe(false)
      expect(container.querySelector("#notes")!.hasAttribute("required")).toBe(false)
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah pembayaran pemasok", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <VendorPaymentForm
          vendors={[{ id: 1, name: "Pemasok A" }]}
          bills={[]}
          payment={{ id: 5, vendorId: 1, amount: 1000, date: "2026-10-21" }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pembayaran pemasok")
      unmount(root, container)
    })
  })
})
