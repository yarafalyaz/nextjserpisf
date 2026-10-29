// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

import { mount, act } from "./mount"

const refreshMock = vi.fn()
const assignMock = vi.fn(async () => ({ success: true }))
const updateAssignMock = vi.fn(async () => ({ success: true }))
const { showSuccessMock, showErrorMock } = vi.hoisted(() => ({ showSuccessMock: vi.fn(), showErrorMock: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: refreshMock }
  },
}))
vi.mock("@/actions/hrm.actions", () => ({
  assignEmployeePayrollComponent: (...a: unknown[]) => assignMock(...(a as [])),
  updateEmployeePayrollComponent: (...a: unknown[]) => updateAssignMock(...(a as [])),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: showSuccessMock, showError: showErrorMock }))
vi.mock("@/components/ui/button", async () => await import("./button-mock"))

import { EmployeePayrollComponents } from "../employee-payroll-components"

const assignments = [
  {
    id: 5,
    employeeId: 9,
    componentId: 1,
    defaultAmount: 500000,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    isActive: true,
    component: { name: "Tunjangan Makan", kind: "earning", recurrence: "fixed", isTaxable: true, isActive: true },
  },
]

const components = [{ id: 1, name: "Tunjangan Makan", kind: "earning" }]

describe("EmployeePayrollComponents", () => {
  it("renders assignment with formatted amount and open-ended period", () => {
    const { container, root } = mount(
      <EmployeePayrollComponents employeeId={9} assignments={assignments} components={components} />,
    )
    expect(container.textContent).toContain("Tunjangan Makan")
    expect(container.textContent).toContain("Rp 500.000")
    expect(container.textContent).toContain("seterusnya")
    expect(container.querySelector('form[aria-label="Ubah nominal Tunjangan Makan"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Nonaktifkan penugasan Tunjangan Makan"]')).not.toBeNull()
    act(() => root.unmount())
  })

  it("empty state message", () => {
    const { container, root } = mount(
      <EmployeePayrollComponents employeeId={9} assignments={[]} components={components} />,
    )
    expect(container.textContent).toContain("Belum ada penugasan komponen gaji tetap untuk karyawan ini.")
    act(() => root.unmount())
  })

  it("aksi melempar (network/server) → toast error fallback, bukan unhandled rejection", async () => {
    assignMock.mockRejectedValueOnce(new Error("network down"))
    const { container, root } = mount(
      <EmployeePayrollComponents employeeId={9} assignments={[]} components={components} />,
    )
    const form = container.querySelector<HTMLFormElement>(
      'form[aria-label="Formulir tambah penugasan komponen gaji"]',
    )!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(showErrorMock).toHaveBeenCalledWith("Gagal menyimpan penugasan komponen gaji")
    expect(showSuccessMock).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it("no fixed components shows guidance and disables submit", () => {
    const { container, root } = mount(
      <EmployeePayrollComponents employeeId={9} assignments={[]} components={[]} />,
    )
    expect(container.textContent).toContain("Tidak ada komponen tetap aktif")
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement | null
    expect(submit?.disabled).toBe(true)
    act(() => root.unmount())
  })
})
