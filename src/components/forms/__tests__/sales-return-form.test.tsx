// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { SalesReturnForm } from "../sales-return-form"
import { decorativeStars, labelTexts } from "./form-a11y-test-utils"

function mountInto(node: HTMLElement) {
  const root: Root = createRoot(node)
  return { root, container: node }
}

function unmount(root: Root) {
  act(() => {
    root.unmount()
  })
}

// Ensure the useRouter mock doesn't throw
vi.mock("next/navigation", () => ({
  useRouter() {
    return {
      refresh: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
    }
  }
}))

// Mock server actions so the form does not pull next-auth (which needs
// `next/server` and breaks under pure jsdom unit tests).
const createSalesReturnMock = vi.fn().mockResolvedValue({ success: true })
const updateSalesReturnMock = vi.fn().mockResolvedValue({ success: true })
vi.mock("@/actions/sales.actions", () => ({
  createSalesReturn: (...args: unknown[]) => createSalesReturnMock(...args),
  updateSalesReturn: (...args: unknown[]) => updateSalesReturnMock(...args),
}))

// QuickAddSelect resolves its target via the registry, which statically imports
// server actions (next-auth/next-server). Stub it so this unit test stays pure.
vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, {
    get: () => ({ title: "Stub", fields: [], action: vi.fn() }),
  }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

describe("SalesReturnForm", () => {
  const mockInvoices = [{ id: 1, documentNo: "INV-001" }]
  const mockCustomers = [{ id: 10, name: "Customer A" }]
  const mockItems = [{ id: 100, sku: "ITEM-A", name: "Product A" }]

  it("seeds return items from returnData on edit", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <SalesReturnForm
          invoices={mockInvoices}
          customers={mockCustomers}
          items={mockItems}
          returnData={{
            id: 5,
            salesInvoiceId: 1,
            date: "2026-06-16",
            reason: "Damaged",
            items: [{ itemId: 100, qty: 5 }]
          }}
        />
      )
    })

    const qtyInput = container.querySelector("input[type='number']") as HTMLInputElement
    expect(qtyInput).not.toBeNull()
    expect(qtyInput.value).toBe("5")

    unmount(root)
    container.remove()
  })

  it("a11y: aria-label tambah + aria-busy false; Pelanggan wajib aria-required + bintang dekoratif; Faktur tetap opsional", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <SalesReturnForm invoices={mockInvoices} customers={mockCustomers} items={mockItems} />
      )
    })

    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah retur penjualan")
    expect(form.getAttribute("aria-busy")).toBe("false")
    expect(container.querySelector("#customerId")!.getAttribute("aria-required")).toBe("true")
    expect(container.querySelector("#salesInvoiceId")!.getAttribute("aria-required")).toBeNull()
    expect(decorativeStars(form).length).toBe(1)
    expect(labelTexts(form)).toEqual(expect.arrayContaining(["Pelanggan *", "Faktur (Opsional)"]))

    unmount(root)
    container.remove()
  })

  it("a11y mode ubah: aria-label ubah retur penjualan", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <SalesReturnForm
          invoices={mockInvoices}
          customers={mockCustomers}
          items={mockItems}
          returnData={{ id: 5, salesInvoiceId: 1, date: "2026-06-16" }}
        />
      )
    })

    expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah retur penjualan")

    unmount(root)
    container.remove()
  })

  it("nota retur pajak: nilai tersimpan tampil di mode ubah", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <SalesReturnForm
          invoices={mockInvoices}
          customers={mockCustomers}
          items={mockItems}
          returnData={{
            id: 5,
            salesInvoiceId: 1,
            date: "2026-06-16",
            taxReturnNoteNumber: "NR-2026-001",
            taxReturnNoteDate: "2026-06-10",
          }}
        />
      )
    })

    const numberInput = container.querySelector<HTMLInputElement>("#taxReturnNoteNumber")!
    expect(numberInput.value).toBe("NR-2026-001")
    expect(numberInput.required).toBe(false)
    expect(container.querySelector<HTMLInputElement>("input[name='taxReturnNoteDate']")!.value).toBe("2026-06-10")
    expect(labelTexts(container.querySelector("form")!)).toEqual(
      expect.arrayContaining(["Nomor Nota Retur Pajak (Opsional)", "Tanggal Nota Retur Pajak (Opsional)"]),
    )

    unmount(root)
    container.remove()
  })

  it("nota retur pajak: submit mengirim nomor + tanggal; kosong tetap terkirim kosong", async () => {
    createSalesReturnMock.mockClear()
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)

    act(() => {
      root.render(
        <SalesReturnForm
          invoices={mockInvoices}
          customers={mockCustomers}
          items={mockItems}
          returnData={{ id: 0, salesInvoiceId: 1, date: "2026-06-16", taxReturnNoteDate: "2026-06-10" }}
        />
      )
    })

    const numberInput = container.querySelector<HTMLInputElement>("#taxReturnNoteNumber")!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    act(() => {
      setter.call(numberInput, "NR-2026-002")
      numberInput.dispatchEvent(new Event("input", { bubbles: true }))
    })

    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })

    expect(createSalesReturnMock).toHaveBeenCalledTimes(1)
    const formData = createSalesReturnMock.mock.calls[0][0] as FormData
    expect(formData.get("taxReturnNoteNumber")).toBe("NR-2026-002")
    expect(formData.get("taxReturnNoteDate")).toBe("2026-06-10")

    unmount(root)
    container.remove()
  })
})
