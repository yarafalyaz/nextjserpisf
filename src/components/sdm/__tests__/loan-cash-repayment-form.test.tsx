// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { LoanCashRepaymentForm } from "../loan-cash-repayment-form"
import { recordEmployeeLoanCashRepayment } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/hrm.actions", () => ({ recordEmployeeLoanCashRepayment: vi.fn() }))

const actionMock = vi.mocked(recordEmployeeLoanCashRepayment)
const successMock = vi.mocked(showSuccess)
const errorMock = vi.mocked(showError)

const accounts = [
  { id: 11, code: "110101", name: "Kas Kecil" },
  { id: 12, code: "110102", name: "Bank BCA" },
]

function mount() {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(<LoanCashRepaymentForm loanId={7} remainingAmount={500000} accounts={accounts} />)
  })
  return { container, root }
}

function unmount(root: Root, container: HTMLElement) {
  act(() => root.unmount())
  container.remove()
}

beforeEach(() => {
  vi.clearAllMocks()
  actionMock.mockResolvedValue({ success: true, id: 3 })
})

describe("LoanCashRepaymentForm — BR-LOAN-07", () => {
  it("a11y: label terikat id, bukti wajib, aria-label form", () => {
    const { container, root } = mount()
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir setoran tunai pinjaman")
    expect(container.querySelector("label[for='repaymentAmount']")).not.toBeNull()
    expect(container.querySelector("label[for='repaymentCashAccount']")).not.toBeNull()
    const notes = container.querySelector("#repaymentNotes")!
    expect(notes.getAttribute("required")).not.toBeNull()
    expect(notes.getAttribute("name")).toBe("notes")
    expect(container.querySelector("input[name='repaymentDate']")).not.toBeNull()
    unmount(root, container)
  })

  it("sisa tampil verbatim + peringatan kelebihan ditolak", () => {
    const { container, root } = mount()
    expect(container.textContent).toContain("Rp 500.000")
    expect(container.textContent).toContain("kelebihan dikembalikan")
    unmount(root, container)
  })

  it("submit memanggil aksi dengan FormData; sukses → toast sukses", async () => {
    const { container, root } = mount()
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(actionMock).toHaveBeenCalledTimes(1)
    const sent = actionMock.mock.calls[0]![0] as FormData
    expect(sent.get("loanId")).toBe("7")
    expect(successMock).toHaveBeenCalledWith("Setoran tunai berhasil dicatat")
    unmount(root, container)
  })

  it("error service tampil verbatim", async () => {
    actionMock.mockResolvedValueOnce({
      success: false,
      error: "Setoran Rp 600.000 melebihi sisa Rp 500.000 — kelebihan dikembalikan",
    })
    const { container, root } = mount()
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(errorMock).toHaveBeenCalledWith(
      "Setoran Rp 600.000 melebihi sisa Rp 500.000 — kelebihan dikembalikan",
    )
    unmount(root, container)
  })
})
