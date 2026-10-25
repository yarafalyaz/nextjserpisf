// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const issueAction = vi.fn()
vi.mock("@/actions/tax-documents.actions", () => ({
  issueDownPaymentTaxInvoiceAction: (fd: FormData) => issueAction(fd),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

import { DownPaymentTaxPanel, type DownPaymentTaxRowView } from "../down-payment-tax-panel"
import { showError, showSuccess } from "@/lib/utils/toast"

const BASE: DownPaymentTaxRowView = {
  downPaymentId: 42,
  documentNo: "DP-2026-001",
  customerName: "PT Uji",
  paymentDate: new Date("2026-10-20T00:00:00+07:00"),
  amount: 110_000,
  dpStatus: "confirmed",
  vatDpp: 100_000,
  vatAmount: 11_000,
  vatTaxPeriod: "2026-10",
  pkpStatusSnapshot: null,
  pkpEffectiveFromSnapshot: null,
  pkpSnapshotLabel: "pkp",
  taxInvoiceId: null,
  taxInvoiceNumber: null,
  taxStatus: "terutang-belum-terbit",
  taxStatusLabel: "PPN uang muka terutang — FP UM belum terbit",
} as DownPaymentTaxRowView

const ISSUED: DownPaymentTaxRowView = {
  ...BASE,
  downPaymentId: 43,
  documentNo: "DP-2026-002",
  taxInvoiceId: 7,
  taxInvoiceNumber: "010.000-26.00000007",
  taxStatus: "fp-um-terbit",
  taxStatusLabel: "FP uang muka terbit",
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

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function openAndSubmit(container: HTMLDivElement) {
  const openBtn = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Terbitkan FP Uang Muka"))
  act(() => {
    openBtn!.click()
  })
  container.querySelector<HTMLInputElement>("#dp-tax-number-42")!.value = "010.000-26.00000042"
}

describe("DownPaymentTaxPanel F-2026-10-25-004-V", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    issueAction.mockResolvedValue({ success: true, id: 99 })
  })

  it("tampil snapshot verbatim + badge status server, tanpa hitung ulang", () => {
    const { container } = mount(<DownPaymentTaxPanel rows={[BASE, ISSUED]} canIssue />)
    expect(container.textContent).toContain("DP-2026-001")
    expect(container.textContent).toContain("PT Uji")
    expect(container.textContent).toContain("PPN uang muka terutang — FP UM belum terbit")
    expect(container.textContent).toContain("FP uang muka terbit")
    expect(container.textContent).toContain("010.000-26.00000007")
  })

  it("tombol terbit hanya untuk baris terutang-belum-terbit", () => {
    const { container } = mount(<DownPaymentTaxPanel rows={[BASE, ISSUED]} canIssue />)
    const buttons = [...container.querySelectorAll("button")].filter((b) => b.textContent?.includes("Terbitkan FP Uang Muka"))
    expect(buttons).toHaveLength(1)
  })

  it("tanpa izin create_tax_invoices: form terbit disembunyikan", () => {
    const { container } = mount(<DownPaymentTaxPanel rows={[BASE]} canIssue={false} />)
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(container.textContent).toContain("PPN uang muka terutang — FP UM belum terbit")
  })

  it("submit kirim downPaymentId + nomor DJP + idempotencyKey ke action", async () => {
    const { container } = mount(<DownPaymentTaxPanel rows={[BASE]} canIssue />)
    openAndSubmit(container)
    expect(container.querySelector("#dp-tax-number-42")).not.toBeNull()
    const form = container.querySelector("form")!
    act(() => {
      form.requestSubmit()
    })
    await flush()
    expect(issueAction).toHaveBeenCalledTimes(1)
    const fd = issueAction.mock.calls[0][0] as FormData
    expect(fd.get("downPaymentId")).toBe("42")
    expect(fd.get("taxInvoiceNumber")).toBe("010.000-26.00000042")
    expect(String(fd.get("idempotencyKey")).length).toBeGreaterThanOrEqual(8)
    expect(showSuccess).toHaveBeenCalled()
  })

  it("galat service tampil verbatim lewat toast error", async () => {
    issueAction.mockResolvedValue({ success: false, error: "DP belum confirmed — FP UM ditolak" })
    const { container } = mount(<DownPaymentTaxPanel rows={[BASE]} canIssue />)
    openAndSubmit(container)
    act(() => {
      container.querySelector("form")!.requestSubmit()
    })
    await flush()
    expect(showError).toHaveBeenCalledWith("DP belum confirmed — FP UM ditolak")
  })

  it("galat gerbang identitas tampil verbatim lewat toast error", async () => {
    issueAction.mockResolvedValue({ success: false, error: "NITKU lawan transaksi tidak diawali NPWP lawan transaksi — periksa apakah NITKU milik entitas lain" })
    const { container } = mount(<DownPaymentTaxPanel rows={[BASE]} canIssue />)
    openAndSubmit(container)
    act(() => {
      container.querySelector("form")!.requestSubmit()
    })
    await flush()
    expect(showError).toHaveBeenCalledWith("NITKU lawan transaksi tidak diawali NPWP lawan transaksi — periksa apakah NITKU milik entitas lain")
  })

  it("checkbox konfirmasi NPWP 15 digit terkirim sebagai legacy15Confirmed", async () => {
    const { container } = mount(<DownPaymentTaxPanel rows={[BASE]} canIssue />)
    openAndSubmit(container)
    const cb = container.querySelector<HTMLInputElement>("#dp-tax-legacy15-42")
    expect(cb).not.toBeNull()
    cb!.checked = true
    act(() => {
      container.querySelector("form")!.requestSubmit()
    })
    await flush()
    const fd = issueAction.mock.calls[0][0] as FormData
    expect(fd.get("legacy15Confirmed")).toBe("true")
  })

  it("empty state saat belum ada DP", () => {
    const { container } = mount(<DownPaymentTaxPanel rows={[]} canIssue />)
    expect(container.textContent).toContain("Belum ada uang muka tercatat.")
  })
})
