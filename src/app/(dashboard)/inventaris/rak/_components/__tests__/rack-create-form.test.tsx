// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { RackCreateForm } from "../rack-create-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/inventory.actions", () => ({
  createRack: vi.fn().mockResolvedValue({ success: true }),
  getNextRackCode: vi.fn().mockResolvedValue({ code: "RCK-001" }),
}))

vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: { warehouse: { title: "Gudang", fields: [], action: vi.fn() } },
}))

vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

function mount(element: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => { root.render(element) })
  return { container, root }
}

const warehouses = [{ id: 1, name: "Gudang Utama" }]

describe("rack-create-form — a11y wiring", () => {
  it("aria-label + aria-busy false, Gudang wajib aria-required, bintang dekoratif", () => {
    const { container, root } = mount(<RackCreateForm enableAutoCode warehouses={warehouses} />)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah rak")
    expect(form.getAttribute("aria-busy")).toBe("false")
    const combobox = container.querySelector('[role="combobox"]')!
    expect(combobox.getAttribute("aria-required")).toBe("true")
    expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
    expect(form.querySelectorAll('span[aria-hidden="true"].text-destructive').length).toBe(2)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(expect.arrayContaining(["Kode Rak", "Nama Rak *", "Gudang *"]))
    act(() => root.unmount())
    container.remove()
  })
})
