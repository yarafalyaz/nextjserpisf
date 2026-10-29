// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

import { mount, act } from "./mount"

const refreshMock = vi.fn()
const createMock = vi.fn(async () => ({ success: true }))
const updateMock = vi.fn(async () => ({ success: true }))
const setActiveMock = vi.fn(async () => ({ success: true }))
const { showSuccessMock, showErrorMock } = vi.hoisted(() => ({ showSuccessMock: vi.fn(), showErrorMock: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: refreshMock }
  },
}))
vi.mock("@/actions/hrm.actions", () => ({
  createPayrollComponent: (...a: unknown[]) => createMock(...(a as [])),
  updatePayrollComponent: (...a: unknown[]) => updateMock(...(a as [])),
  setPayrollComponentActive: (...a: unknown[]) => setActiveMock(...(a as [])),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: showSuccessMock, showError: showErrorMock }))
vi.mock("@/components/ui/button", () => ({
  Button: (p: {
    children: React.ReactNode
    isDisabled?: boolean
    onPress?: () => void
    onClick?: () => void
    [key: string]: unknown
  }) => {
    const { onPress, onClick, isDisabled, children, ...rest } = p
    return (
      <button
        {...(rest as Record<string, unknown>)}
        disabled={isDisabled}
        onClick={() => (onPress ?? onClick)?.()}
      >
        {children}
      </button>
    )
  },
}))

import { PayrollComponentMaster, taxableLabel } from "../payroll-component-master"

const components = [
  { id: 1, name: "Tunjangan Makan", kind: "earning", recurrence: "fixed", isTaxable: true, accountId: null, isActive: true },
  { id: 2, name: "Potongan Kasbon", kind: "deduction", recurrence: "variable", isTaxable: false, accountId: null, isActive: false },
]

describe("PayrollComponentMaster", () => {
  it("rows show kind, recurrence, taxable classification, active state", () => {
    const { container, root } = mount(<PayrollComponentMaster components={components} />)
    expect(container.textContent).toContain("Tunjangan Makan")
    expect(container.textContent).toContain("Pendapatan")
    expect(container.textContent).toContain("Tetap")
    expect(container.textContent).toContain("Kena pajak (klasifikasi)")
    expect(container.textContent).toContain("Potongan Kasbon")
    expect(container.textContent).toContain("Nonaktif")
    expect(container.querySelector('[aria-label="Aktifkan Potongan Kasbon"]')).not.toBeNull()
    act(() => root.unmount())
  })

  it("empty state", () => {
    const { container, root } = mount(<PayrollComponentMaster components={[]} />)
    expect(container.textContent).toContain("Belum ada komponen gaji tercatat.")
    act(() => root.unmount())
  })

  it("create form shows honest tax note, no journal/auto-tax claim", () => {
    const { container, root } = mount(<PayrollComponentMaster components={components} />)
    expect(container.querySelector('label[for="pc-name"]')).not.toBeNull()
    expect(container.textContent).toContain("klasifikasi belum mengubah hitungan pajak maupun jurnal")
    expect(container.textContent).not.toContain("bebas pajak")
    expect(container.textContent).not.toContain("jurnal otomatis")
    act(() => root.unmount())
  })

  it("aksi melempar (network/server) → toast error fallback, bukan unhandled rejection", async () => {
    setActiveMock.mockRejectedValueOnce(new Error("network down"))
    const { container, root } = mount(<PayrollComponentMaster components={components} />)
    const btn = container.querySelector<HTMLButtonElement>('[aria-label="Aktifkan Potongan Kasbon"]')!
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(showErrorMock).toHaveBeenCalledWith("Gagal menyimpan komponen gaji")
    expect(showSuccessMock).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it("taxableLabel keeps classification framing", () => {
    expect(taxableLabel(true, "earning")).toContain("klasifikasi")
    expect(taxableLabel(false, "earning")).toContain("klasifikasi")
    expect(taxableLabel(true, "deduction")).toBe("—")
  })
})
