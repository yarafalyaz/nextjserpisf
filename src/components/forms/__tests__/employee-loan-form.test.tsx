// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { EmployeeLoanForm } from "../employee-loan-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/hrm.actions", () => ({
  createEmployeeLoan: vi.fn().mockResolvedValue({ success: true }),
  updateEmployeeLoan: vi.fn().mockResolvedValue({ success: true }),
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

function mount(node: HTMLElement, edit = false): Root {
  const root = createRoot(node)
  act(() => {
    root.render(
      <EmployeeLoanForm
        employees={[{ id: 1, name: "Budi" }, { id: 2, name: "Ani" }]}
        loan={edit ? { id: 9, employeeId: 1, loanDate: "2026-10-01", totalAmount: 1000000, monthlyInstallment: 100000, remainingAmount: 900000, status: "active", notes: null } : undefined}
      />,
    )
  })
  return root
}

describe("EmployeeLoanForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; karyawan aria-required; bintang dekoratif aria-hidden", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah pinjaman karyawan")
    expect(form.getAttribute("aria-busy")).toBe("false")

    const combobox = container.querySelector('[role="combobox"]')!
    expect(combobox.getAttribute("aria-required")).toBe("true")

    expect(container.querySelector("#totalAmount")!.getAttribute("required")).not.toBeNull()
    expect(container.querySelector("#monthlyInstallment")!.getAttribute("required")).not.toBeNull()

    const stars = form.querySelectorAll('span[aria-hidden="true"].text-destructive')
    expect(stars.length).toBe(3)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toContain("Karyawan *")
    expect(labels).toContain("Jumlah Pinjaman (Rp) *")
    expect(labels).toContain("Cicilan per Bulan (Rp) *")
    act(() => root.unmount())
    container.remove()
  })

  it("mode ubah: aria-label ubah pinjaman karyawan", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container, true)
    expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pinjaman karyawan")
    act(() => root.unmount())
    container.remove()
  })
})
