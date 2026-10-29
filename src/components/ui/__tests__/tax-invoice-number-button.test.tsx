// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { act } from "react"

import { TaxInvoiceNumberButton } from "../tax-invoice-number-button"
import {
  newTestContainer,
  renderTestUi,
  clickTestEl,
  unmountTestUi,
} from "./confirm-button-test-utils"
import { testToastCalls as toast, resetTestToastCalls } from "./test-toast-store"

// Blok mock bersama confirm-button-test-utils: renderer daun diuji lewat
// helper itu, bukan jsdom ulang di tiap berkas (pola repo).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("@/lib/utils/toast", async (_importOriginal) => {
  const store = await import("./test-toast-store")
  return {
    showSuccess: (m: string) => { store.testToastCalls.ok.push(m) },
    showError: (m: string) => { store.testToastCalls.err.push(m) },
  }
})

beforeEach(resetTestToastCalls)

function setInput(v: string) {
  const input = document.querySelector("input[name='taxInvoiceNumber']") as HTMLInputElement | null
  expect(input).not.toBeNull()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    setter.call(input, v)
    input!.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

function confirmLast() {
  const buttons = Array.from(document.querySelectorAll("button")).filter(
    (b) => b.textContent === "Isi Nomor Faktur",
  )
  const confirm = buttons[buttons.length - 1] ?? null
  expect(confirm).not.toBeNull()
  clickTestEl(confirm)
}

describe("TaxInvoiceNumberButton (157-V Putusan 2)", () => {
  it("alur penuh: kosong ditolak, isi trim sukses, error verbatim", async () => {
    const action = vi.fn(async (_id: number, _fd: FormData) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <TaxInvoiceNumberButton id={9} action={action} />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    // Kosong → tolak client-side.
    confirmLast()
    expect(action).not.toHaveBeenCalled()
    expect(toast.err.some((m) => m.includes("wajib diisi"))).toBe(true)
    // Isi → trim + sukses.
    setInput("  010.001-26.00000001  ")
    await act(async () => {})
    confirmLast()
    await act(async () => {})
    expect(action).toHaveBeenCalledTimes(1)
    expect(action.mock.calls[0][0]).toBe(9)
    expect((action.mock.calls[0][1] as FormData).get("taxInvoiceNumber")).toBe("010.001-26.00000001")
    expect(toast.ok.some((m) => m.includes("berhasil diisi"))).toBe(true)
    unmountTestUi(root, container)
    // Error service tampil verbatim.
    const msg = "Nomor faktur pajak tidak valid."
    const fail = vi.fn(async (_id: number, _fd: FormData) => ({ success: false as const, error: msg }))
    const c2 = newTestContainer()
    renderTestUi(c2.container, c2.root, <TaxInvoiceNumberButton id={11} action={fail} />)
    clickTestEl(c2.container.querySelector("button"))
    await act(async () => {})
    setInput("!!!")
    await act(async () => {})
    confirmLast()
    await act(async () => {})
    expect(toast.err).toContain(msg)
    unmountTestUi(c2.root, c2.container)
  })
})
