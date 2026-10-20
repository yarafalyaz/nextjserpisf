// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { DeliveryOrderForm } from "../delivery-order-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)

const salesOrders = [
  { id: 1, documentNo: "SO-001", customer: { name: "Pelanggan A" } },
]

describe("DeliveryOrderForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; combobox pesanan aria-required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <DeliveryOrderForm salesOrders={salesOrders} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah surat jalan")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(1)
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Pesanan Penjualan *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah surat jalan", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <DeliveryOrderForm
          salesOrders={salesOrders}
          deliveryOrder={{ id: 3, salesOrderId: 1, date: "2026-10-20", items: [] }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah surat jalan")
      unmount(root, container)
    })
  })
})
