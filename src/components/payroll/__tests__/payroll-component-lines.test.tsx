// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const refreshMock = vi.fn()
const addMock = vi.fn(async () => ({ success: true }))
const updateAmountMock = vi.fn(async () => ({ success: true }))
const removeMock = vi.fn(async () => ({ success: true }))

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: refreshMock }
  },
}))
vi.mock("@/actions/hrm.actions", () => ({
  addPayrollComponentLine: (...a: unknown[]) => addMock(...(a as [])),
  updatePayrollComponentLineAmount: (...a: unknown[]) => updateAmountMock(...(a as [])),
  removePayrollComponentLine: (...a: unknown[]) => removeMock(...(a as [])),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    isDisabled,
    ...rest
  }: {
    children: React.ReactNode
    isDisabled?: boolean
    [key: string]: unknown
  }) => (
    <button {...(rest as Record<string, unknown>)} disabled={isDisabled}>
      {children}
    </button>
  ),
  buttonVariants: vi.fn(() => ""),
}))
vi.mock("@/components/ui/delete-button", () => ({
  DeleteButton: ({ id }: { id: number }) => <span data-delete-id={id}>Hapus</span>,
}))

import { PayrollComponentLines, type PayrollComponentLineRow } from "../payroll-component-lines"

const line = (over: Partial<PayrollComponentLineRow> = {}): PayrollComponentLineRow => ({
  id: 3,
  componentId: 1,
  componentNameSnapshot: "Tunjangan Makan",
  kindSnapshot: "earning",
  recurrenceSnapshot: "fixed",
  isTaxableSnapshot: true,
  source: "fixed_assignment",
  amount: 500000,
  ...over,
})

const options = [
  { id: 1, name: "Tunjangan Makan", kind: "earning", recurrence: "fixed" },
  { id: 2, name: "Bonus Proyek", kind: "earning", recurrence: "variable" },
  { id: 4, name: "Potongan Disiplin", kind: "deduction", recurrence: "fixed" },
]

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

describe("PayrollComponentLines", () => {
  it("draft + canEdit: snapshot row, manual form only offers unused variable components", () => {
    const { container, root } = mount(
      <PayrollComponentLines
        payrollId={7}
        status="draft"
        lines={[line()]}
        components={options}
        allowances={500000}
        deductions={0}
        canEdit={true}
      />,
    )
    expect(container.textContent).toContain("Tunjangan Makan")
    expect(container.textContent).toContain("Penugasan tetap")
    expect(container.textContent).toContain("Kena pajak (klasifikasi)")
    expect(container.textContent).toContain("Total Tunjangan (turunan baris pendapatan)")
    expect(container.querySelector('form[aria-label="Formulir tambah baris komponen gaji"]')).not.toBeNull()
    const select = container.querySelector("#line-component") as HTMLSelectElement
    const offered = Array.from(select.options).map((o) => o.value)
    // Fixed already-used and unused fixed excluded from manual adds; variable offered.
    expect(offered).toContain("2")
    expect(offered).not.toContain("1")
    expect(offered).not.toContain("4")
    expect(container.querySelector('form[aria-label="Ubah nominal Tunjangan Makan"]')).not.toBeNull()
    expect(container.querySelector("[data-delete-id='3']")).not.toBeNull()
    act(() => root.unmount())
  })

  it("paid slip: read-only lock note, no mutation forms", () => {
    const { container, root } = mount(
      <PayrollComponentLines
        payrollId={7}
        status="paid"
        lines={[line()]}
        components={options}
        allowances={500000}
        deductions={0}
        canEdit={true}
      />,
    )
    expect(container.textContent).toContain("Slip sudah bukan draf — baris komponen terkunci")
    expect(container.querySelector('form[aria-label="Formulir tambah baris komponen gaji"]')).toBeNull()
    expect(container.querySelector("[data-delete-id]")).toBeNull()
    act(() => root.unmount())
  })

  it("draft without edit permission: read-only permission note", () => {
    const { container, root } = mount(
      <PayrollComponentLines
        payrollId={7}
        status="draft"
        lines={[line()]}
        components={options}
        allowances={500000}
        deductions={0}
        canEdit={false}
      />,
    )
    expect(container.textContent).toContain("hanya dapat diubah oleh pengguna berizin ubah penggajian")
    expect(container.querySelector('form[aria-label="Formulir tambah baris komponen gaji"]')).toBeNull()
    act(() => root.unmount())
  })

  it("empty lines state", () => {
    const { container, root } = mount(
      <PayrollComponentLines
        payrollId={7}
        status="draft"
        lines={[]}
        components={options}
        allowances={0}
        deductions={0}
        canEdit={true}
      />,
    )
    expect(container.textContent).toContain("Belum ada baris komponen gaji pada slip ini.")
    act(() => root.unmount())
  })
})
