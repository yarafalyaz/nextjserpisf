// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const correctPaidPayroll = vi.fn()
const showSuccess = vi.fn()
const showError = vi.fn()
const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh, push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/hrm.actions", () => ({
  correctPaidPayroll: (...args: unknown[]) => correctPaidPayroll(...args),
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
  ConfirmDialog: (p: {
    isOpen: boolean
    onConfirm: () => void
    confirmLabel: string
    children?: React.ReactNode
  }) =>
    p.isOpen ? (
      <div>
        {p.children}
        <button type="button" onClick={p.onConfirm}>
          {p.confirmLabel}
        </button>
      </div>
    ) : null,
}))

import { mount, act } from "@/components/payroll/__tests__/mount"
import type { Root } from "react-dom/client"
import { CorrectPaidPayrollButton } from "../correct-paid-button"

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

function setValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

async function openAndFill(container: HTMLElement, reason: string) {
  await clickText(container, "Koreksi")
  const textarea = container.querySelector<HTMLTextAreaElement>("#payroll-correction-reason")
  if (!textarea) throw new Error("textarea alasan koreksi tidak ditemukan")
  await act(async () => {
    setValue(textarea, reason)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  correctPaidPayroll.mockResolvedValue({ success: true, id: 42 })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ""
})

describe("CorrectPaidPayrollButton — sukses palsu", () => {
  it("{success:false} → showError verbatim, tanpa showSuccess/refresh", async () => {
    correctPaidPayroll.mockResolvedValue({ success: false, error: "Alasan koreksi wajib diisi." })
    const container = render(<CorrectPaidPayrollButton payrollId={9} />)
    await openAndFill(container, "   ")
    await clickText(container, "Ya, Terbitkan Koreksi")
    expect(correctPaidPayroll).toHaveBeenCalledTimes(1)
    const [id, fd] = correctPaidPayroll.mock.calls[0] as [number, FormData]
    expect(id).toBe(9)
    expect(fd).toBeInstanceOf(FormData)
    expect(fd.get("reason")).toBe("   ")
    expect(showError).toHaveBeenCalledWith("Alasan koreksi wajib diisi.")
    expect(showSuccess).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("{success:true} → kirim FormData reason, showSuccess + refresh", async () => {
    const container = render(<CorrectPaidPayrollButton payrollId={9} />)
    await openAndFill(container, "Koreksi tunjangan kurang catat")
    await clickText(container, "Ya, Terbitkan Koreksi")
    expect(correctPaidPayroll).toHaveBeenCalledTimes(1)
    const [id, fd] = correctPaidPayroll.mock.calls[0] as [number, FormData]
    expect(id).toBe(9)
    expect(fd).toBeInstanceOf(FormData)
    expect(fd.get("reason")).toBe("Koreksi tunjangan kurang catat")
    expect(showSuccess).toHaveBeenCalledWith("Dokumen koreksi penggajian berhasil diterbitkan!")
    expect(refresh).toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })

  it("aksi melempar → showError pesan error, tanpa showSuccess/refresh", async () => {
    correctPaidPayroll.mockRejectedValue(new Error("jaringan putus"))
    const container = render(<CorrectPaidPayrollButton payrollId={9} />)
    await openAndFill(container, "Koreksi tunjangan kurang catat")
    await clickText(container, "Ya, Terbitkan Koreksi")
    expect(showError).toHaveBeenCalledWith("jaringan putus")
    expect(showSuccess).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
