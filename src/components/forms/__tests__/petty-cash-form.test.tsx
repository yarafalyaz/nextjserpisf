// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { PettyCashForm } from "../petty-cash-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/finance.actions", () => ({
  createPettyCash: vi.fn().mockResolvedValue({ success: true }),
  updatePettyCash: vi.fn().mockResolvedValue({ success: true }),
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

function mount(node: HTMLElement): Root {
  const root = createRoot(node)
  act(() => {
    root.render(
      <PettyCashForm
        accounts={[
          { id: 1, code: "1100", name: "Kas Kecil", type: "ASSET" },
          { id: 2, code: "5100", name: "Beban Operasional", type: "EXPENSE" },
        ]}
      />,
    )
  })
  return root
}

describe("PettyCashForm — a11y wiring", () => {
  it("form punya aria-label tambah + aria-busy false; field wajib punya aria-required/required; bintang dekoratif aria-hidden", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah kas kecil")
    expect(form.getAttribute("aria-busy")).toBe("false")

    const type = container.querySelector("#type")!
    expect(type.getAttribute("aria-required")).toBe("true")

    const amount = container.querySelector("#amount")!
    expect(amount.getAttribute("required")).not.toBeNull()

    const stars = form.querySelectorAll('span[aria-hidden="true"].text-destructive')
    expect(stars.length).toBe(2)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toContain("Tipe *")
    expect(labels).toContain("Jumlah (Rp) *")
    act(() => root.unmount())
    container.remove()
  })

  it("mode ubah: aria-label ubah kas kecil", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <PettyCashForm
          accounts={[{ id: 1, code: "1100", name: "Kas Kecil", type: "ASSET" }]}
          pettyCash={{ id: 9, date: "2026-10-01", amount: 50000, accountId: 1 }}
        />,
      )
    })
    expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah kas kecil")
    act(() => root.unmount())
    container.remove()
  })
})
