// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { PayrollForm } from "../payroll-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/hrm.actions", () => ({
  processPayroll: vi.fn().mockResolvedValue({ success: true }),
  updatePayroll: vi.fn().mockResolvedValue({ success: true }),
  getPayrollEstimation: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, {
    get: () => ({ title: "Stub", fields: [], action: vi.fn() }),
  }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

function mount(node: HTMLElement, props?: { initialData?: { id: number } }): Root {
  const root = createRoot(node)
  act(() => {
    root.render(
      <PayrollForm
        employees={[{ id: 1, name: "Budi" }]}
        initialData={props?.initialData as never}
      />,
    )
  })
  return root
}

describe("PayrollForm — a11y wiring", () => {
  it("form punya aria-label tambah + aria-busy false; Karyawan required; bintang dekoratif aria-hidden", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah penggajian")
    expect(form.getAttribute("aria-busy")).toBe("false")

    const karyawan = container.querySelector("#employeeId")!
    expect(karyawan.getAttribute("aria-required")).toBe("true")

    const stars = form.querySelectorAll('span[aria-hidden="true"].text-destructive')
    expect(stars.length).toBeGreaterThanOrEqual(3)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toContain("Karyawan *")
    expect(labels).toContain("Periode Penggajian *")
    expect(labels).toContain("Gaji Pokok *")
    act(() => root.unmount())
    container.remove()
  })

  it("mode ubah: aria-label ubah penggajian", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container, { initialData: { id: 7 } })
    expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah penggajian")
    act(() => root.unmount())
    container.remove()
  })
})
