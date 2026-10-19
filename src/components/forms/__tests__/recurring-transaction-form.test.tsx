// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { RecurringTransactionForm } from "../recurring-transaction-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/recurring.actions", () => ({
  createRecurringTransaction: vi.fn().mockResolvedValue({ success: true }),
  updateRecurringTransaction: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

const ACCOUNTS = [
  { id: 1, label: "5100 — Beban Sewa" },
  { id: 2, label: "1100 — Kas" },
]

function mount(node: HTMLElement): Root {
  const root = createRoot(node)
  act(() => {
    root.render(<RecurringTransactionForm accounts={ACCOUNTS} expenseCategories={[]} />)
  })
  return root
}

describe("RecurringTransactionForm — a11y wiring", () => {
  it("form punya aria-label tambah + aria-busy false; select wajib aria-required; combobox wajib aria-required; bintang dekoratif aria-hidden", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah transaksi berulang")
    expect(form.getAttribute("aria-busy")).toBe("false")

    expect(container.querySelector("#type")!.getAttribute("aria-required")).toBe("true")
    expect(container.querySelector("#frequency")!.getAttribute("aria-required")).toBe("true")
    expect(container.querySelector("#debitAccountId")!.getAttribute("aria-required")).toBe("true")
    expect(container.querySelector("#creditAccountId")!.getAttribute("aria-required")).toBe("true")
    expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()

    const stars = form.querySelectorAll('span[aria-hidden="true"].text-destructive')
    // type=journal default menampilkan debit/kredit; accountId beban hanya di mode expense.
    expect(stars.length).toBe(6)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toContain("Nama Jadwal *")
    expect(labels).toContain("Akun Debit *")

    // Hint interval terhubung ke input via aria-describedby.
    const interval = container.querySelector("#interval")!
    expect(interval.getAttribute("aria-describedby")).toBe("interval-hint")
    expect(container.querySelector("#interval-hint")).not.toBeNull()
    act(() => root.unmount())
    container.remove()
  })

  it("mode ubah: aria-label ubah transaksi berulang", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <RecurringTransactionForm
          accounts={ACCOUNTS}
          expenseCategories={[]}
          schedule={{
            id: 9,
            name: "Sewa bulanan",
            type: "journal",
            frequency: "monthly",
            interval: 1,
            startDate: "2026-10-01",
            endDate: null,
            description: "",
            amount: 50000,
            debitAccountId: 1,
            creditAccountId: 2,
            accountId: null,
            paidFromAccountId: null,
            categoryId: null,
            isActive: true,
          }}
        />,
      )
    })
    expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah transaksi berulang")
    act(() => root.unmount())
    container.remove()
  })
})
