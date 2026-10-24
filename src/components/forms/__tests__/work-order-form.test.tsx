// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { WorkOrderForm } from "../work-order-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/inventory.actions", () => ({
  createWorkOrder: vi.fn().mockResolvedValue({ success: true }),
  updateWorkOrder: vi.fn().mockResolvedValue({ success: true }),
}))

// QuickAddSelect resolves its target via the registry, which statically imports
// server actions (next-auth/next-server). Stub it so this unit test stays pure.
vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, {
    get: () => ({ title: "Stub", fields: [], action: vi.fn() }),
  }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

function mount(element: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => { root.render(element) })
  return { container, root }
}

const customers = [{ id: 1, name: "Pelanggan A" }]
const items = [{ id: 7, sku: "SKU-7", name: "Baut M8", cost: "1000" }]

describe("work-order-form — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, Pelanggan bintang dekoratif + wajib, opsional bersih", () => {
    const { container, root } = mount(<WorkOrderForm customers={customers} items={items} />)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah perintah kerja")
    expect(form.getAttribute("aria-busy")).toBe("false")
    expect(form.querySelectorAll('span[aria-hidden="true"].text-destructive').length).toBe(1)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(expect.arrayContaining(["Pelanggan *", "Catatan"]))
    expect(container.querySelector("#customerId")!.getAttribute("aria-required")).toBe("true")
    expect(container.querySelector("#date-trigger")!.getAttribute("aria-required")).toBe("true")
    expect(container.querySelector("#startDate-trigger")!.getAttribute("aria-required")).not.toBe("true")
    expect(container.querySelector("#endDate-trigger")!.getAttribute("aria-required")).not.toBe("true")
    act(() => root.unmount())
    container.remove()
  })

  it("ubah: aria-label ubah perintah kerja", () => {
    const workOrder = { id: 9, customerId: 1, date: "2026-10-22" }
    const { container, root } = mount(<WorkOrderForm customers={customers} items={items} workOrder={workOrder} />)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir ubah perintah kerja")
    expect(form.getAttribute("aria-busy")).toBe("false")
    act(() => root.unmount())
    container.remove()
  })
})
