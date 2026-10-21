// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"

import { act } from "react"
import { renderCard as render, unmountCard } from "./card-test-utils"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  createProgressInvoice: vi.fn(),
}))
const { push, showError, showSuccess, createProgressInvoice } = mocks

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    push: mocks.push,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}))

vi.mock("@/actions/sales.actions", () => ({
  createProgressInvoice: (...args: unknown[]) => mocks.createProgressInvoice(...args),
}))

vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => mocks.showError(...args),
  showSuccess: (...args: unknown[]) => mocks.showSuccess(...args),
}))

import { ProgressInvoiceButton } from "../progress-invoice-button"

afterEach(() => {
  vi.clearAllMocks()
  document.body.replaceChildren()
})

describe("ProgressInvoiceButton F-2026-10-20-58", () => {
  it("tampil dengan input persen dan tombol progres", () => {
    const { container, root } = render(<ProgressInvoiceButton quotationId={7} />)
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Target progres persen"]')
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Buat faktur progres"]')
    expect(input).not.toBeNull()
    expect(button).not.toBeNull()
    expect(button?.textContent).toContain("Buat Faktur Progres")
    unmountCard(root)
    container.remove()
  })

  it("memanggil aksi dengan quotationId dan menavigasi ke faktur hasil", async () => {
    createProgressInvoice.mockResolvedValue({ success: true, id: 99, slug: "inv-2026-0099" })
    const { container, root } = render(
      <ProgressInvoiceButton quotationId={7} />,
    )
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Buat faktur progres"]',
    )!
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Target progres persen"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
      setter.call(input, "40")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    await act(async () => {
      button.click()
    })

    expect(createProgressInvoice).toHaveBeenCalledTimes(1)
    expect(createProgressInvoice).toHaveBeenCalledWith(7, 40)
    expect(showSuccess).toHaveBeenCalledWith("Faktur progres dibuat")
    expect(showError).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith("/penjualan/faktur/inv-2026-0099")
    unmountCard(root)
    container.remove()
  })

  it("menampilkan error server apa adanya tanpa navigasi", async () => {
    createProgressInvoice.mockResolvedValue({
      success: false,
      error: "Target progres sudah tertagih penuh",
    })
    const { container, root } = render(
      <ProgressInvoiceButton quotationId={7} />,
    )
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Buat faktur progres"]',
    )!

    await act(async () => {
      button.click()
    })

    expect(showError).toHaveBeenCalledWith(
      "Target progres sudah tertagih penuh",
    )
    expect(showSuccess).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    unmountCard(root)
    container.remove()
  })
})
