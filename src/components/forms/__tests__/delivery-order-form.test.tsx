// @vitest-environment jsdom
import { describe, it, vi } from "vitest"
import { DeliveryOrderForm } from "../delivery-order-form"
import {
  mountInto, unmount, withContainer, assertOrderComboboxA11yAdd, assertFormEditLabel,
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
      assertOrderComboboxA11yAdd(container.querySelector("form")!, container, {
        addLabel: "Formulir tambah surat jalan",
        requiredLabel: "Pesanan Penjualan *",
      })
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
      assertFormEditLabel(container, "Formulir ubah surat jalan")
      unmount(root, container)
    })
  })
})
