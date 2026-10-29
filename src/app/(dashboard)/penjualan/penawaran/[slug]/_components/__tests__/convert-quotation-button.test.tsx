// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const convertQuotationToOrder = vi.fn()
const showSuccess = vi.fn()
const showError = vi.fn()
const refresh = vi.fn()
const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh, push, replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/sales.actions", () => ({
  convertQuotationToOrder: (...args: unknown[]) => convertQuotationToOrder(...args),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: (...args: unknown[]) => showSuccess(...args),
  showError: (...args: unknown[]) => showError(...args),
}))

vi.mock("@/components/ui/button", () => ({
  Button: (p: {
    children: React.ReactNode
    onPress?: () => void
    onClick?: () => void
  }) => (
    <button type="button" onClick={() => (p.onPress ?? p.onClick)?.()}>
      {p.children}
    </button>
  ),
}))

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: (p: { isOpen: boolean; onConfirm: () => void; confirmLabel: string }) =>
    p.isOpen ? (
      <button type="button" onClick={p.onConfirm}>
        {p.confirmLabel}
      </button>
    ) : null,
}))

import { mount, act } from "@/components/payroll/__tests__/mount"
import type { Root } from "react-dom/client"
import { ConvertQuotationButton } from "../convert-quotation-button"

const roots: Root[] = []

function render(node: React.ReactNode): HTMLElement {
  const { container, root } = mount(node)
  roots.push(root)
  return container
}

function clickText(container: HTMLElement, text: string) {
  const buttons = Array.from(container.querySelectorAll("button"))
  const el =
    buttons.find((b) => b.textContent?.trim() === text) ??
    buttons.find((b) => b.textContent?.includes(text))
  if (!el) throw new Error(`tombol "${text}" tidak ditemukan`)
  return act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  convertQuotationToOrder.mockResolvedValue({ success: true, id: 42 })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ""
})

describe("ConvertQuotationButton", () => {
  it("{success:false} → showError verbatim, tanpa showSuccess/navigasi", async () => {
    convertQuotationToOrder.mockResolvedValue({
      success: false,
      error: "Hanya penawaran approved/accepted yang dapat dikonversi",
    })
    const container = render(<ConvertQuotationButton quotationId={7} />)
    await clickText(container, "Konversi ke Pesanan")
    await clickText(container, "Konversi")
    expect(convertQuotationToOrder).toHaveBeenCalledWith(7)
    expect(showError).toHaveBeenCalledWith(
      "Hanya penawaran approved/accepted yang dapat dikonversi",
    )
    expect(showSuccess).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("{success:true, id} → showSuccess + push ke detail pesanan hasil", async () => {
    const container = render(<ConvertQuotationButton quotationId={7} />)
    await clickText(container, "Konversi ke Pesanan")
    await clickText(container, "Konversi")
    expect(convertQuotationToOrder).toHaveBeenCalledWith(7)
    expect(showSuccess).toHaveBeenCalledWith(
      "Penawaran dikonversi menjadi Pesanan Penjualan",
    )
    expect(push).toHaveBeenCalledWith("/penjualan/pesanan/42")
    expect(showError).not.toHaveBeenCalled()
  })

  it("{success:true} tanpa id → showSuccess + refresh", async () => {
    convertQuotationToOrder.mockResolvedValue({ success: true })
    const container = render(<ConvertQuotationButton quotationId={7} />)
    await clickText(container, "Konversi ke Pesanan")
    await clickText(container, "Konversi")
    expect(showSuccess).toHaveBeenCalledWith(
      "Penawaran dikonversi menjadi Pesanan Penjualan",
    )
    expect(refresh).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
