// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act } from "react"
import { JournalForm } from "../journal-form"
import { mountInto, unmount, withContainer } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/finance.actions", () => ({
  createJournal: vi.fn(),
  updateJournal: vi.fn(),
}))

import { createJournal, updateJournal } from "@/actions/finance.actions"

const accounts = [
  { id: 1, code: "1110", name: "Kas" },
  { id: 2, code: "4110", name: "Pendapatan" },
]

describe("JournalForm — a11y wiring", () => {
  beforeEach(() => vi.clearAllMocks())

  it("tambah: aria-label tambah jurnal + aria-busy false", () => {
    withContainer((container) => {
      const root = mountInto(container, <JournalForm accounts={accounts} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah jurnal")
      expect(form.getAttribute("aria-busy")).toBe("false")
      unmount(root, container)
    })
  })

  it("ubah: aria-label ubah jurnal", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <JournalForm
          accounts={accounts}
          journal={{
            id: 7,
            date: "2026-10-21",
            description: "Jurnal lama",
            entries: [
              { accountId: 1, debit: 100, credit: 0 },
              { accountId: 2, debit: 0, credit: 100 },
            ],
          }}
        />,
      )
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah jurnal")
      unmount(root, container)
    })
  })

  it("aria-busy true saat submit pending, kembali false setelah selesai", async () => {
    let resolveCreate!: (v: any) => void
    vi.mocked(createJournal).mockImplementation(
      () => new Promise((r) => { resolveCreate = r }),
    )
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(container, <JournalForm accounts={accounts} />)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-busy")).toBe("false")
    // Entri default 0/0 seimbang -> submit lolos guard isBalanced.
    // act async: flush startTransition pending tanpa tebak jumlah macrotask.
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(form.getAttribute("aria-busy")).toBe("true")
    await act(async () => { resolveCreate({ success: true }) })
    expect(form.getAttribute("aria-busy")).toBe("false")
    unmount(root, container)
    expect(createJournal).toHaveBeenCalledTimes(1)
    expect(updateJournal).not.toHaveBeenCalled()
  })
})
