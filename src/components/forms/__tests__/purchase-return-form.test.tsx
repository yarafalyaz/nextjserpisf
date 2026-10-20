// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { PurchaseReturnForm } from "../purchase-return-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/purchase.actions", () => ({
  createPurchaseReturn: vi.fn().mockResolvedValue({ success: true }),
  updatePurchaseReturn: vi.fn().mockResolvedValue({ success: true }),
}))

const purchaseOrders = [{ id: 1, documentNo: "PO-001" }]
const items = [{ id: 7, sku: "BRG-001", name: "Busi" }]

describe("PurchaseReturnForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; combobox pesanan aria-required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <PurchaseReturnForm purchaseOrders={purchaseOrders} items={items} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah retur pembelian")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(1)
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Pesanan Pembelian *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah retur pembelian", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <PurchaseReturnForm
          purchaseOrders={purchaseOrders}
          items={items}
          returnData={{ id: 3, purchaseOrderId: 1, date: "2026-10-20", items: [{ itemId: 7, qty: 2 }] }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah retur pembelian")
      unmount(root, container)
    })
  })
})
