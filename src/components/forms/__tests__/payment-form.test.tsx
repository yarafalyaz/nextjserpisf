// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { PaymentForm } from "../payment-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/sales.actions", () => ({
  createSalesPayment: vi.fn().mockResolvedValue({ success: true }),
  updateSalesPayment: vi.fn().mockResolvedValue({ success: true }),
}))

const invoices = [{ id: 1, documentNo: "INV-001", grandTotal: "1000000", paidAmount: "0", customer: { name: "Budi" } }]

describe("PaymentForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; combobox wajib aria-required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <PaymentForm invoices={invoices} accounts={[]} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah pembayaran")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(2)
      expect(container.querySelector("#amount")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(3)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Faktur *", "Metode Bayar *", "Jumlah Bayar (Rp) *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah pembayaran", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <PaymentForm invoices={invoices} accounts={[]} payment={{ id: 3, salesInvoiceId: 1, amount: 500000 }} />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pembayaran")
      unmount(root, container)
    })
  })
})
