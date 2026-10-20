// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  createDifferenceInvoice: vi.fn(),
}))
const { push, refresh, showError, showSuccess, createDifferenceInvoice } = mocks

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    push: mocks.push,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}))

vi.mock("@/actions/sales.actions", () => ({
  createDifferenceInvoice: (...args: unknown[]) => mocks.createDifferenceInvoice(...args),
}))

vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => mocks.showError(...args),
  showSuccess: (...args: unknown[]) => mocks.showSuccess(...args),
}))

import { DifferenceInvoiceButton } from "../difference-invoice-button"

function render(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

afterEach(() => {
  vi.clearAllMocks()
  document.body.replaceChildren()
})

describe("DifferenceInvoiceButton F-2026-10-20-10", () => {
  it("tampil hanya untuk penawaran yang pernah direvisi", () => {
    const first = render(<DifferenceInvoiceButton quotationId={7} revisionNumber={0} />)
    expect(first.container.textContent).not.toContain("Buat Faktur Selisih")
    act(() => first.root.unmount())
    first.container.remove()

    const second = render(<DifferenceInvoiceButton quotationId={7} revisionNumber={2} />)
    const button = second.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Buat faktur selisih"]',
    )
    expect(button).not.toBeNull()
    expect(button?.textContent).toContain("Buat Faktur Selisih")
    expect(button?.getAttribute("aria-busy")).not.toBe("true")
    act(() => second.root.unmount())
    second.container.remove()
  })

  it("memanggil aksi dengan quotationId dan menavigasi ke faktur hasil", async () => {
    createDifferenceInvoice.mockResolvedValue({ success: true, id: 99, slug: "inv-2026-0099" })
    const { container, root } = render(
      <DifferenceInvoiceButton quotationId={7} revisionNumber={2} />,
    )
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Buat faktur selisih"]',
    )!

    await act(async () => {
      button.click()
    })

    expect(createDifferenceInvoice).toHaveBeenCalledTimes(1)
    expect(createDifferenceInvoice).toHaveBeenCalledWith(7)
    expect(showSuccess).toHaveBeenCalledWith("Faktur selisih dibuat")
    expect(showError).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith("/penjualan/faktur/inv-2026-0099")
    act(() => root.unmount())
    container.remove()
  })

  it("menampilkan error server apa adanya tanpa navigasi", async () => {
    createDifferenceInvoice.mockResolvedValue({
      success: false,
      error: "Tidak ada selisih: nilai revisi sudah tertagih penuh",
    })
    const { container, root } = render(
      <DifferenceInvoiceButton quotationId={7} revisionNumber={2} />,
    )
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Buat faktur selisih"]',
    )!

    await act(async () => {
      button.click()
    })

    expect(showError).toHaveBeenCalledWith(
      "Tidak ada selisih: nilai revisi sudah tertagih penuh",
    )
    expect(showSuccess).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    act(() => root.unmount())
    container.remove()
  })
})
