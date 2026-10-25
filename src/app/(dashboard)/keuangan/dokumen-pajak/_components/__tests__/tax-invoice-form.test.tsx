// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const push = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push, replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/tax-documents.actions", () => ({
  issueTaxInvoiceAction: vi.fn(),
  replaceTaxInvoiceAction: vi.fn(),
  cancelTaxInvoiceAction: vi.fn(),
  creditInputInvoiceAction: vi.fn(),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

import { TaxInvoiceForm } from "../tax-invoice-form"
import { issueTaxInvoiceAction } from "@/actions/tax-documents.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

function mount(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<TaxInvoiceForm salesInvoices={[]} vendorBills={[]} vendors={[]} />)
  })
  return { container, root }
}

async function submit(container: HTMLDivElement) {
  const form = container.querySelector("form")!
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe("TaxInvoiceForm — konfirmasi legacy15 F-2026-10-25-004-S", () => {
  beforeEach(() => vi.clearAllMocks())

  it("arah out: checkbox legacy15Confirmed tampil; centang ikut FormData apa adanya", async () => {
    vi.mocked(issueTaxInvoiceAction).mockResolvedValue({ success: true } as never)
    const { container, root } = mount()
    const box = container.querySelector<HTMLInputElement>("#legacy15Confirmed")
    expect(box).not.toBeNull()
    expect(container.querySelector('label[for="legacy15Confirmed"]')?.textContent).toContain("15 digit (legacy)")
    box!.checked = true
    await submit(container)
    const fd = vi.mocked(issueTaxInvoiceAction).mock.calls[0][0] as FormData
    expect(fd.get("legacy15Confirmed")).toBe("true")
    act(() => root.unmount())
    document.body.replaceChildren()
  })

  it("tanpa centang: legacy15Confirmed tidak terkirim (server menolak legacy15 tanpa konfirmasi)", async () => {
    vi.mocked(issueTaxInvoiceAction).mockResolvedValue({ success: true } as never)
    const { container, root } = mount()
    await submit(container)
    const fd = vi.mocked(issueTaxInvoiceAction).mock.calls[0][0] as FormData
    expect(fd.get("legacy15Confirmed")).toBeNull()
    act(() => root.unmount())
    document.body.replaceChildren()
  })
})

describe("TaxInvoiceForm — error service tampil verbatim (HANDOFF Bot 4)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("gagal service: showError menerima pesan service persis, tanpa parafrase", async () => {
    vi.mocked(issueTaxInvoiceAction).mockResolvedValue({
      success: false,
      error: "Nomor faktur pajak sudah dipakai dokumen lain",
    } as never)
    const { container, root } = mount()
    await submit(container)
    expect(showError).toHaveBeenCalledWith("Nomor faktur pajak sudah dipakai dokumen lain")
    expect(showSuccess).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    act(() => root.unmount())
    document.body.replaceChildren()
  })

  it("sukses: showSuccess tampil dan navigasi ke /laporan/pajak", async () => {
    vi.mocked(issueTaxInvoiceAction).mockResolvedValue({ success: true } as never)
    const { container, root } = mount()
    await submit(container)
    expect(showSuccess).toHaveBeenCalledWith("Faktur pajak diterbitkan")
    expect(push).toHaveBeenCalledWith("/laporan/pajak")
    expect(showError).not.toHaveBeenCalled()
    act(() => root.unmount())
    document.body.replaceChildren()
  })
})
