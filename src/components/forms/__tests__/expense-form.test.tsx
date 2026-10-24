// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { ExpenseForm } from "../expense-form"
import { showError } from "@/lib/utils/toast"
import { setFieldValue } from "./form-a11y-test-utils"

const createExpenseMock = vi.fn().mockResolvedValue({ success: true })
const updateExpenseMock = vi.fn().mockResolvedValue({ success: true })

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/finance.actions", () => ({
  createExpense: (...args: unknown[]) => createExpenseMock(...args),
  updateExpense: (...args: unknown[]) => updateExpenseMock(...args),
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
      <ExpenseForm
        accounts={[
          { id: 1, code: "5100", name: "Beban Operasional", type: "EXPENSE" },
          { id: 2, code: "1100", name: "Kas", type: "ASSET" },
        ]}
      />,
    )
  })
  return root
}

describe("ExpenseForm — a11y wiring", () => {
  it("form punya aria-label tambah + aria-busy false; field wajib punya aria-required; bintang dekoratif aria-hidden", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah pengeluaran")
    expect(form.getAttribute("aria-busy")).toBe("false")

    const account = container.querySelector("#accountId")!
    expect(account.getAttribute("aria-required")).toBe("true")

    const amount = container.querySelector("#amount")!
    expect(amount.getAttribute("required")).not.toBeNull()

    const stars = form.querySelectorAll('span[aria-hidden="true"].text-destructive')
    expect(stars.length).toBe(2)
    // Label text tanpa bintang polos (bintang terpisah, tidak terbaca SR)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toContain("Akun Beban *")
    act(() => root.unmount())
    container.remove()
  })

  it("mode ubah: aria-label ubah pengeluaran", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <ExpenseForm
          accounts={[{ id: 1, code: "5100", name: "Beban Operasional", type: "EXPENSE" }]}
          expense={{ id: 9, date: "2026-10-01", amount: 50000, accountId: 1 }}
        />,
      )
    })
    expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pengeluaran")
    act(() => root.unmount())
    container.remove()
  })

  it("L3: centang + isi WO/alasan menulis frasa persis ke description", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    const toggle = container.querySelector<HTMLInputElement>("#description-l3-enabled")!
    expect(toggle.checked).toBe(false)
    act(() => { toggle.click() })
    act(() => setFieldValue(container.querySelector<HTMLInputElement>("#description-l3-work-order-no")!, "WO-0007"))
    act(() => setFieldValue(container.querySelector<HTMLTextAreaElement>("#description-l3-reason")!, "Denda keterlambatan supplier"))
    expect(container.querySelector<HTMLTextAreaElement>("#description")!.value).toBe(
      "BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan: Denda keterlambatan supplier",
    )
    expect(container.textContent).toContain("bukan biaya job")
    act(() => { toggle.click() })
    expect(container.querySelector<HTMLTextAreaElement>("#description")!.value).toBe("")
    act(() => root.unmount())
    container.remove()
  })

  it("L3: edit description bertanda membaca balik terstruktur; error server verbatim", async () => {
    const serverError = "Akun 5100 bertipe COGS adalah akun biaya job/persediaan/WIP — dilarang untuk biaya telat non-job L3 (Putusan 1 F-133-V). Pilih akun beban operasional bertipe EXPS/OEXP."
    updateExpenseMock.mockResolvedValueOnce({ success: false, error: serverError })
    vi.mocked(showError).mockClear()
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <ExpenseForm
          accounts={[{ id: 1, code: "5100", name: "Beban Operasional", type: "EXPENSE" }]}
          expense={{
            id: 9, date: "2026-10-01", amount: 50000, accountId: 1,
            description: "BIAYA TELAT NON-JOB L3 | WO: WO-0009 | Alasan: Biaya parkir susulan",
          }}
        />,
      )
    })
    expect(container.querySelector<HTMLInputElement>("#description-l3-enabled")!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>("#description-l3-work-order-no")!.value).toBe("WO-0009")
    expect(container.querySelector<HTMLTextAreaElement>("#description-l3-reason")!.value).toBe("Biaya parkir susulan")
    act(() => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    act(() => root.unmount())
    container.remove()
    await act(async () => {})
    expect(updateExpenseMock).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith(serverError)
  })
})
