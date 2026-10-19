// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { BankStatementForm } from "../form"

const push = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push, replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/finance.actions", () => ({
  createBankStatement: vi.fn().mockResolvedValue({ success: true, id: 42 }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

import { createBankStatement } from "@/actions/finance.actions"

function mount(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <BankStatementForm
        accounts={[{ id: 7, code: "1101", name: "Bank BCA", type: "ASSET" } as never]}
        banks={[{ id: 3, code: "BCA", name: "Bank Central Asia" } as never]}
      />,
    )
  })
  return { container, root }
}

describe("BankStatementForm — wiring createBankStatement", () => {
  beforeEach(() => vi.clearAllMocks())

  it("form aria-label tambah, field skema tampil, submit memanggil aksi + redirect ke detail", async () => {
    const { container, root } = mount()
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah rekening koran")
    expect(form.getAttribute("aria-busy")).toBe("false")
    // Field yang dibaca bankStatementSchema wajib ada sebagai input bernama.
    for (const name of ["accountId", "bankId", "accountNumber", "date", "reference", "openingBalance", "closingBalance", "notes"]) {
      expect(form.querySelector(`[name="${name}"]`), `field ${name}`).not.toBeNull()
    }
    expect(container.querySelector("#accountId")).not.toBeNull()
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(createBankStatement).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/keuangan/laporan-bank/42")
    act(() => root.unmount())
    container.remove()
  })
})
