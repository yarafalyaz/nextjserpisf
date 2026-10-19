// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { AppreciationForm } from "../appreciation-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/hrm.actions", () => ({
  createAppreciation: vi.fn().mockResolvedValue({ success: true }),
  updateAppreciation: vi.fn().mockResolvedValue({ success: true }),
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
      <AppreciationForm
        employees={[{ id: 1, name: "Budi" }]}
        appreciation={edit ? { id: 9, employeeId: 1, date: "2026-10-01", type: "bonus", amount: 50000, notes: null } : undefined}
      />,
    )
  })
  return root
}

describe("AppreciationForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; karyawan aria-required; bintang dekoratif aria-hidden", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah apresiasi")
    expect(form.getAttribute("aria-busy")).toBe("false")

    const combobox = container.querySelector('[role="combobox"]')!
    expect(combobox.getAttribute("aria-required")).toBe("true")

    const amount = container.querySelector("#amount")!
    expect(amount.getAttribute("required")).not.toBeNull()

    const stars = form.querySelectorAll('span[aria-hidden="true"].text-destructive')
    expect(stars.length).toBe(3)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toContain("Karyawan *")
    expect(labels).toContain("Tipe *")
    expect(labels).toContain("Jumlah (Rp) *")
    act(() => root.unmount())
    container.remove()
  })

  it("mode ubah: aria-label ubah apresiasi", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container, true)
    expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah apresiasi")
    act(() => root.unmount())
    container.remove()
  })
})
