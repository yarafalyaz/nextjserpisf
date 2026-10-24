// @vitest-environment jsdom
import { describe, it, vi } from "vitest"

// Radix (Combobox/Dialog) pakai ResizeObserver; jsdom tidak punya.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver

import { VendorPaymentForm } from "../vendor-payment-form"
import { mountInto, unmount, withContainer, assertMoneyFormA11yAdd, assertFormEditLabel } from "./form-a11y-test-utils"

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
      // Label AppDatePicker "Tanggal Bayar *" string bersama di luar cakupan;
      // trigger-nya tetap wajib (paymentDate-trigger) di daftar aria-required.
      assertMoneyFormA11yAdd(form, container, {
        addLabel: "Formulir tambah pembayaran pemasok",
        starCount: 3,
        labels: ["Pemasok *", "Metode Pembayaran *", "Jumlah (Rp) *", "No. Referensi", "No. Rekening", "Catatan"],
        ariaRequiredIds: ["vendorId", "paymentMethod", "paymentDate-trigger"],
        requiredIds: ["amount"],
        optionalIds: ["referenceNumber", "bankAccount", "notes"],
      })
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
      assertFormEditLabel(container, "Formulir ubah pembayaran pemasok")
      unmount(root, container)
    })
  })
})
