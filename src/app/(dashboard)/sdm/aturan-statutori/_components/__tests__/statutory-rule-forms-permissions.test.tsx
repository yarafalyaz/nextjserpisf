// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/hrm.actions", () => ({
  closeStatutoryRule: vi.fn(async () => ({ success: true })),
  createStatutoryRule: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

vi.mock("@/components/ui/date-picker", () => ({
  AppDatePicker: ({ name, label }: { name: string; label?: string }) => (
    <label>
      {label}
      <input name={name} />
    </label>
  ),
}))

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
}))

import { CloseRuleForm, StatutoryRuleForm } from "../statutory-rule-forms"

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

const btn = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) ?? null

describe("statutory-rule-forms gerbang izin UI (create_payroll/edit_payroll)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("tanpa izin: form tambah + form tutup hilang", () => {
    const a = mount(<StatutoryRuleForm canCreate={false} />)
    expect(a.container.querySelector('form[aria-label="Tambah aturan statutori"]')).toBeNull()
    expect(btn(a.container, "Tambah")).toBeNull()
    act(() => a.root.unmount())

    const b = mount(<CloseRuleForm id={1} canEdit={false} />)
    expect(b.container.querySelector('form[aria-label="Tutup aturan 1"]')).toBeNull()
    expect(btn(b.container, "Tutup")).toBeNull()
    act(() => b.root.unmount())
  })

  it("dengan izin: kedua form tampil", () => {
    const a = mount(<StatutoryRuleForm canCreate />)
    expect(a.container.querySelector('form[aria-label="Tambah aturan statutori"]')).not.toBeNull()
    expect(btn(a.container, "Tambah")).not.toBeNull()
    act(() => a.root.unmount())

    const b = mount(<CloseRuleForm id={1} canEdit />)
    expect(b.container.querySelector('form[aria-label="Tutup aturan 1"]')).not.toBeNull()
    expect(btn(b.container, "Tutup")).not.toBeNull()
    act(() => b.root.unmount())
  })

  it("halaman meneruskan create_payroll/edit_payroll sebagai canCreate/canEdit", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/aturan-statutori/page.tsx"),
      "utf8",
    )
    expect(page).toContain('hasPermission("create_payroll")')
    expect(page).toContain('hasPermission("edit_payroll")')
    expect(page).toContain("canCreate={canCreate}")
    expect(page).toContain("canEdit={canEdit}")
  })
})
