// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { ProductionOrderForm } from "../production-order-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/manufacturing.actions", () => ({
  createProductionOrder: vi.fn(),
  updateProductionOrder: vi.fn(),
}))

describe("ProductionOrderForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; bintang dekoratif; produk aria-required", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <ProductionOrderForm products={[{ id: 5, name: "Produk Jadi", sku: "FG-1" }]} workOrders={[]} />
      ))
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah perintah produksi")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Produk *", "Jumlah Produksi *"]))
      // productId wajib di manufacturing schema -> aria-required; qty native required
      expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(1)
      expect(container.querySelector("#qty")!.getAttribute("required")).not.toBeNull()
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah perintah produksi + qty terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <ProductionOrderForm
          products={[{ id: 5, name: "Produk Jadi", sku: "FG-1" }]}
          workOrders={[]}
          order={{ id: 3, productId: 5, qty: 12 }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah perintah produksi")
      expect(container.querySelector<HTMLInputElement>("#qty")!.value).toBe("12")
      unmount(root, container)
    })
  })
})
