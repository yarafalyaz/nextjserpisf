// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { act } from "react"
import { PurchaseReturnForm } from "../purchase-return-form"
import {
  mountInto, unmount, withContainer, assertOrderComboboxA11yAdd, assertFormEditLabel, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
const createPurchaseReturnMock = vi.fn().mockResolvedValue({ success: true })
vi.mock("@/actions/purchase.actions", () => ({
  createPurchaseReturn: (...args: unknown[]) => createPurchaseReturnMock(...args),
  updatePurchaseReturn: vi.fn().mockResolvedValue({ success: true }),
}))

const purchaseOrders = [{ id: 1, documentNo: "PO-001" }]
const items = [{ id: 7, sku: "BRG-001", name: "Busi" }]

describe("PurchaseReturnForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; combobox pesanan aria-required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <PurchaseReturnForm purchaseOrders={purchaseOrders} items={items} />)
      assertOrderComboboxA11yAdd(container.querySelector("form")!, container, {
        addLabel: "Formulir tambah retur pembelian",
        requiredLabel: "Pesanan Pembelian *",
      })
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
      assertFormEditLabel(container, "Formulir ubah retur pembelian")
      unmount(root, container)
    })
  })

  it("nota retur pajak: nilai tersimpan tampil + submit mengirim nomor dan tanggal", async () => {
    createPurchaseReturnMock.mockClear()
    await act(async () => {})
    withContainer((container) => {
      const root = mountInto(container, (
        <PurchaseReturnForm
          purchaseOrders={purchaseOrders}
          items={items}
          returnData={{
            id: 0, purchaseOrderId: 1, date: "2026-10-20",
            taxReturnNoteNumber: "NR-B-001", taxReturnNoteDate: "2026-10-15",
            items: [{ itemId: 7, qty: 2 }],
          }}
        />
      ))
      const form = container.querySelector("form")!
      expect(container.querySelector<HTMLInputElement>("#taxReturnNoteNumber")!.value).toBe("NR-B-001")
      expect(container.querySelector<HTMLInputElement>("#taxReturnNoteNumber")!.required).toBe(false)
      expect(container.querySelector<HTMLInputElement>("input[name='taxReturnNoteDate']")!.value).toBe("2026-10-15")
      expect(labelTexts(form)).toEqual(
        expect.arrayContaining(["Nomor Nota Retur Pajak (Opsional)", "Tanggal Nota Retur Pajak (Opsional)"]),
      )
      unmount(root, container)
    })

    withContainer((container) => {
      const root = mountInto(container, (
        <PurchaseReturnForm
          purchaseOrders={purchaseOrders}
          items={items}
          returnData={{ id: 0, purchaseOrderId: 1, date: "2026-10-20", taxReturnNoteDate: "2026-10-15", items: [{ itemId: 7, qty: 2 }] }}
        />
      ))
      const numberInput = container.querySelector<HTMLInputElement>("#taxReturnNoteNumber")!
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      act(() => {
        setter.call(numberInput, "NR-B-002")
        numberInput.dispatchEvent(new Event("input", { bubbles: true }))
      })
      act(() => {
        container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      })
      unmount(root, container)
    })
    await act(async () => {})
    expect(createPurchaseReturnMock).toHaveBeenCalledTimes(1)
    const formData = createPurchaseReturnMock.mock.calls[0][0] as FormData
    expect(formData.get("taxReturnNoteNumber")).toBe("NR-B-002")
    expect(formData.get("taxReturnNoteDate")).toBe("2026-10-15")
  })
})
