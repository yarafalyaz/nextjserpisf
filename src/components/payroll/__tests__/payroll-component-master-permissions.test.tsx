// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { mount, act } from "./mount"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/hrm.actions", () => ({
  createPayrollComponent: vi.fn(async () => ({ success: true })),
  updatePayrollComponent: vi.fn(async () => ({ success: true })),
  setPayrollComponentActive: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    isDisabled,
    onPress,
    onClick,
    ...rest
  }: {
    children: React.ReactNode
    isDisabled?: boolean
    onPress?: () => void
    onClick?: () => void
    [key: string]: unknown
  }) => (
    <button
      {...(rest as Record<string, unknown>)}
      disabled={isDisabled}
      onClick={() => (onPress ?? onClick)?.()}
    >
      {children}
    </button>
  ),
}))

import { PayrollComponentMaster } from "../payroll-component-master"

const ROWS = [
  { id: 1, name: "Tunjangan Makan", kind: "earning", recurrence: "fixed", isTaxable: true, accountId: null, isActive: true },
  { id: 2, name: "Potongan Kasbon", kind: "deduction", recurrence: "variable", isTaxable: false, accountId: null, isActive: false },
]

const submitBtn = (c: HTMLElement) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent?.includes("Tambah Komponen")) ?? null
const editBtns = (c: HTMLElement) =>
  [...c.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Ubah")

describe("PayrollComponentMaster gerbang izin UI (create_employees/edit_employees)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("view-only: tabel tampil, form tambah + Ubah + Aktif/Nonaktifkan hilang", () => {
    const { container, root } = mount(
      <PayrollComponentMaster components={ROWS} canCreate={false} canEdit={false} />,
    )
    expect(container.textContent).toContain("Tunjangan Makan")
    expect(container.textContent).toContain("Kena pajak (klasifikasi)")
    expect(container.querySelector('form[aria-label="Formulir tambah komponen gaji"]')).toBeNull()
    expect(editBtns(container)).toHaveLength(0)
    expect(container.querySelector('[aria-label="Nonaktifkan Tunjangan Makan"]')).toBeNull()
    expect(container.querySelector('[aria-label="Aktifkan Potongan Kasbon"]')).toBeNull()
    act(() => root.unmount())
  })

  it("canCreate saja: form tambah tampil, Ubah + Aktif/Nonaktifkan hilang", () => {
    const { container, root } = mount(
      <PayrollComponentMaster components={ROWS} canCreate canEdit={false} />,
    )
    expect(container.querySelector('form[aria-label="Formulir tambah komponen gaji"]')).not.toBeNull()
    expect(submitBtn(container)).not.toBeNull()
    expect(editBtns(container)).toHaveLength(0)
    expect(container.querySelector('[aria-label="Nonaktifkan Tunjangan Makan"]')).toBeNull()
    act(() => root.unmount())
  })

  it("canEdit saja: form tambah hilang, Ubah + Aktif/Nonaktifkan tampil", () => {
    const { container, root } = mount(
      <PayrollComponentMaster components={ROWS} canCreate={false} canEdit />,
    )
    expect(container.querySelector('form[aria-label="Formulir tambah komponen gaji"]')).toBeNull()
    expect(editBtns(container)).toHaveLength(2)
    expect(container.querySelector('[aria-label="Nonaktifkan Tunjangan Makan"]')).not.toBeNull()
    act(() => root.unmount())
  })

  it("halaman meneruskan create_employees/edit_employees sebagai canCreate/canEdit", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/penggajian/komponen/page.tsx"),
      "utf8",
    )
    expect(page).toContain('hasPermission("create_employees")')
    expect(page).toContain('hasPermission("edit_employees")')
    expect(page).toContain("canCreate={canCreate}")
    expect(page).toContain("canEdit={canEdit}")
  })
})
