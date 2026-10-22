// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { DownPaymentForm } from "../down-payment-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/sales.actions", () => ({
  createDownPayment: vi.fn().mockResolvedValue({ success: true }),
  updateDownPayment: vi.fn().mockResolvedValue({ success: true }),
}))

describe("DownPaymentForm — a11y wiring", () => {
  it("bintang dekoratif aria-hidden; combobox + jumlah wajib aria-required; opsional tanpa required", () => {
    withContainer((container) => {
      const root = mountInto(container, <DownPaymentForm customers={[]} quotations={[]} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah uang muka")
      expect(decorativeStars(form).length).toBe(3)
      expect(labelTexts(form)).toEqual(
        expect.arrayContaining(["Penawaran *", "Jumlah DP (Rp) *", "Metode Pembayaran *", "Bukti Pembayaran", "Catatan"]),
      )
      expect(container.querySelector("#quotationId")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#paymentMethod")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#amount")!.hasAttribute("required")).toBe(true)
      expect(container.querySelector("#proofImage")!.hasAttribute("required")).toBe(false)
      expect(container.querySelector("#notes")!.hasAttribute("required")).toBe(false)
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah uang muka", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <DownPaymentForm customers={[]} quotations={[]} downPayment={{ id: 1, customerId: 2, amount: 100, date: "2026-10-21" }} />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah uang muka")
      unmount(root, container)
    })
  })
})
