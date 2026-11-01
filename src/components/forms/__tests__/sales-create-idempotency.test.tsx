// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

// Radix Popover/cmdk pakai ResizeObserver; jsdom tidak punya (pola repo).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver
Element.prototype.scrollIntoView ??= () => {}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { SalesOrderForm } from "../sales-order-form"
import { PaymentForm } from "../payment-form"

const createSalesOrderMock = vi.fn()
const createSalesPaymentMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, { get: () => ({ title: "Stub", fields: [], action: vi.fn() }) }),
}))
vi.mock("@/actions/sales.actions", () => ({
  createSalesOrder: (...args: unknown[]) => createSalesOrderMock(...args),
  updateSalesOrder: vi.fn().mockResolvedValue({ success: true }),
  createSalesPayment: (...args: unknown[]) => createSalesPaymentMock(...args),
  updateSalesPayment: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("@/actions/credit-override.actions", () => ({
  getMyCreditOverrideStatus: vi.fn(),
  approveCreditOverride: vi.fn(),
  rejectCreditOverride: vi.fn(),
  listCreditOverrides: vi.fn(),
}))

function mount(element: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => { root.render(element) })
  return { container, root }
}

async function submit(container: HTMLElement) {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    )
  })
  await act(async () => {})
}

async function choosePaymentMethod(container: HTMLElement) {
  await act(async () => {
    container.querySelector<HTMLElement>("#paymentMethod")!.click()
  })
  await act(async () => {})
  const option = Array.from(document.querySelectorAll('[role="option"]')).find(
    (el) => el.textContent?.includes("Tunai"),
  )
  expect(option, "opsi Tunai").toBeTruthy()
  await act(async () => {
    ;(option as HTMLElement).click()
  })
  await act(async () => {})
}

describe("create penjualan — idempotency key stabil per intent (putaran 52)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createSalesOrderMock.mockResolvedValue({ success: true, id: 1, slug: "so-1" })
    createSalesPaymentMock.mockResolvedValue({ success: true, id: 1 })
  })

  it("SalesOrderForm mengirim idempotencyKey non-kosong saat create", async () => {
    const { container, root } = mount(
      <SalesOrderForm customers={[{ id: 2, name: "Pelanggan A" }]} defaultCustomerId={2} />,
    )
    await submit(container)
    expect(createSalesOrderMock).toHaveBeenCalled()
    const fd = createSalesOrderMock.mock.calls[0]![0] as FormData
    expect(String(fd.get("idempotencyKey") ?? "")).not.toBe("")
    act(() => root.unmount())
    container.remove()
  })

  it("PaymentForm mengirim idempotencyKey non-kosong saat create", async () => {
    const invoices = [{ id: 1, documentNo: "INV-001", grandTotal: "1000000", paidAmount: "0", customer: { name: "Budi" } }]
    const { container, root } = mount(
      <PaymentForm invoices={invoices} accounts={[]} defaultInvoiceId={1} paymentMethods={[{ code: "cash", name: "Tunai" }]} />,
    )
    await choosePaymentMethod(container)
    await submit(container)
    expect(createSalesPaymentMock).toHaveBeenCalled()
    const fd = createSalesPaymentMock.mock.calls[0]![0] as FormData
    expect(String(fd.get("idempotencyKey") ?? "")).not.toBe("")
    act(() => root.unmount())
    container.remove()
  })
})
