// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

const issueMock = vi.fn<(fd: FormData) => Promise<{ success: boolean }>>(async () => ({ success: true }))
vi.mock("@/actions/tax-documents.actions", () => ({
  issueDownPaymentTaxInvoiceAction: (fd: FormData) => issueMock(fd),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

import { DownPaymentTaxStatusPanel, type DownPaymentTaxStatusPanelRow } from "../down-payment-tax-status-panel"

function row(over: Partial<DownPaymentTaxStatusPanelRow>): DownPaymentTaxStatusPanelRow {
  return {
    downPaymentId: 7,
    documentNo: "DP-0007",
    customerName: "PT Uji",
    paymentDate: "2026-10-05T00:00:00.000Z",
    amount: 1110000,
    dpStatus: "confirmed",
    vatDpp: 1000000,
    vatAmount: 110000,
    vatTaxPeriod: "2026-10",
    pkpStatusSnapshot: "pkp",
    pkpEffectiveFromSnapshot: "2026-01-01T00:00:00.000Z",
    pkpSnapshotLabel: "pkp",
    taxInvoiceId: null,
    taxInvoiceNumber: null,
    taxStatus: "terutang-belum-terbit",
    taxStatusLabel: "PPN uang muka terutang — FP UM belum terbit",
    ...over,
  }
}

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

describe("Panel status pajak uang muka F-2026-10-25-004-V", () => {
  beforeEach(() => vi.clearAllMocks())

  it("snapshot server tampil verbatim: label status, DPP/PPN, masa, PKP", () => {
    const { container, root } = mount(<DownPaymentTaxStatusPanel rows={[row({})]} canIssue />)
    expect(container.textContent).toContain("PPN uang muka terutang — FP UM belum terbit")
    expect(container.textContent).toContain("DP-0007")
    expect(container.textContent).toContain("2026-10")
    expect(container.textContent).toContain("pkp")
    act(() => root.unmount())
  })

  it("empty state bila belum ada DP confirmed", () => {
    const { container, root } = mount(<DownPaymentTaxStatusPanel rows={[]} canIssue />)
    expect(container.textContent).toContain("Belum ada uang muka confirmed.")
    act(() => root.unmount())
  })

  it("tanpa izin create_tax_invoices: tombol terbit FP UM tidak tampil", () => {
    const { container, root } = mount(<DownPaymentTaxStatusPanel rows={[row({})]} canIssue={false} />)
    expect(container.textContent).not.toContain("Terbit FP Uang Muka")
    act(() => root.unmount())
  })

  it("baris bukan terutang: tombol terbit tidak tampil walau berizin", () => {
    const { container, root } = mount(
      <DownPaymentTaxStatusPanel rows={[row({ taxStatus: "fp-um-terbit", taxStatusLabel: "FP uang muka terbit", taxInvoiceNumber: "010.000-26.00000001" })]} canIssue />,
    )
    expect(container.textContent).toContain("FP uang muka terbit")
    expect(container.textContent).toContain("010.000-26.00000001")
    expect(container.textContent).not.toContain("Terbit FP Uang Muka")
    act(() => root.unmount())
  })

  it("submit form terbit mengirim downPaymentId + nomor seri + idempotencyKey ke action", async () => {
    const { container, root } = mount(<DownPaymentTaxStatusPanel rows={[row({})]} canIssue />)
    const toggle = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Terbit FP Uang Muka"))
    expect(toggle).toBeTruthy()
    act(() => {
      toggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const input = container.querySelector<HTMLInputElement>('input[name="taxInvoiceNumber"]')
    expect(input).toBeTruthy()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
      setter.call(input, "010.000-26.00000009")
      input!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(issueMock).toHaveBeenCalledTimes(1)
    const fd = issueMock.mock.calls[0][0] as unknown as FormData
    expect(fd.get("downPaymentId")).toBe("7")
    expect(fd.get("taxInvoiceNumber")).toBe("010.000-26.00000009")
    expect(String(fd.get("idempotencyKey"))).toMatch(/.{8,}/)
    act(() => root.unmount())
  })
})
