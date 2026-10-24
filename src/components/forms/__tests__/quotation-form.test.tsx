// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { QuotationForm } from "../quotation-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/sales.actions", () => ({
  createQuotation: vi.fn().mockResolvedValue({ success: true }),
  updateQuotation: vi.fn().mockResolvedValue({ success: true }),
}))

describe("QuotationForm — a11y wiring", () => {
  it("bintang Pelanggan dekoratif; pelanggan wajib aria-required; opsional bersih", () => {
    withContainer((container) => {
      const root = mountInto(container, <QuotationForm customers={[]} customerVehicles={[]} items={[]} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah penawaran")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Pelanggan *", "Kendaraan", "Metode Pembayaran"]))
      expect(container.querySelector("#customerId")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#customerVehicleId")!.getAttribute("aria-required")).not.toBe("true")
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah penawaran", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <QuotationForm
          customers={[]}
          customerVehicles={[]}
          items={[]}
          quotation={{ id: 7, customerId: 2, date: "2026-10-22" }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah penawaran")
      unmount(root, container)
    })
  })
})
