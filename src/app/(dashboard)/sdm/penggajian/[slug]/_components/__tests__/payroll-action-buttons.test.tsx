// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const approvePayroll = vi.fn()
const markPayrollPaid = vi.fn()
const showSuccess = vi.fn()
const showError = vi.fn()
const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh, push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/hrm.actions", () => ({
  approvePayroll: (...args: unknown[]) => approvePayroll(...args),
  markPayrollPaid: (...args: unknown[]) => markPayrollPaid(...args),
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
import { ApprovePayrollButton } from "../approve-button"
import { MarkPaidPayrollButton } from "../mark-paid-button"

const roots: Root[] = []

function render(node: React.ReactNode): HTMLElement {
  const { container, root } = mount(node)
  roots.push(root)
  return container
}

function clickText(container: HTMLElement, text: string) {
  const el = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  )
  if (!el) throw new Error(`tombol "${text}" tidak ditemukan`)
  return act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  approvePayroll.mockResolvedValue({ success: true })
  markPayrollPaid.mockResolvedValue({ success: true })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ""
})

describe("ApprovePayrollButton — sukses palsu", () => {
  it("{success:false} → showError verbatim, tanpa showSuccess/refresh", async () => {
    approvePayroll.mockResolvedValue({ success: false, error: "Payroll hanya bisa di-approve dari status draft" })
    const container = render(<ApprovePayrollButton payrollId={9} />)
    await clickText(container, "Finalisasi")
    await clickText(container, "Ya, Finalisasi Sekarang")
    expect(approvePayroll).toHaveBeenCalledWith(9)
    expect(showError).toHaveBeenCalledWith("Payroll hanya bisa di-approve dari status draft")
    expect(showSuccess).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("{success:true} → showSuccess + refresh", async () => {
    const container = render(<ApprovePayrollButton payrollId={9} />)
    await clickText(container, "Finalisasi")
    await clickText(container, "Ya, Finalisasi Sekarang")
    expect(showSuccess).toHaveBeenCalledWith("Penggajian berhasil disetujui (Finalisasi)!")
    expect(refresh).toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })
})

describe("MarkPaidPayrollButton — sukses palsu", () => {
  it("{success:false} → showError verbatim, tanpa showSuccess/refresh", async () => {
    markPayrollPaid.mockResolvedValue({ success: false, error: "Periode terkunci" })
    const container = render(<MarkPaidPayrollButton payrollId={9} />)
    await clickText(container, "Tandai Dibayar")
    await clickText(container, "Ya, Tandai Dibayar")
    expect(markPayrollPaid).toHaveBeenCalledWith(9)
    expect(showError).toHaveBeenCalledWith("Periode terkunci")
    expect(showSuccess).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("{success:true} → showSuccess + refresh", async () => {
    const container = render(<MarkPaidPayrollButton payrollId={9} />)
    await clickText(container, "Tandai Dibayar")
    await clickText(container, "Ya, Tandai Dibayar")
    expect(showSuccess).toHaveBeenCalledWith("Penggajian berhasil ditandai sebagai dibayar!")
    expect(refresh).toHaveBeenCalled()
  })
})
