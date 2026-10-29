// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { act } from "react"
import { VoidButton } from "../void-button"
import {
  newTestContainer,
  renderTestUi,
  clickTestEl,
  unmountTestUi,
  findButtonByText,
} from "./confirm-button-test-utils"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const toastCalls: { ok: string[]; err: string[] } = { ok: [], err: [] }
vi.mock("@/lib/utils/toast", () => ({
  showSuccess: (m: string) => { toastCalls.ok.push(m) },
  showError: (m: string) => { toastCalls.err.push(m) },
}))

beforeEach(() => {
  toastCalls.ok = []
  toastCalls.err = []
})

describe("VoidButton requireReason (BR-F139-01 presentasi)", () => {
  it("menolak client-side bila alasan kosong — aksi nol dipanggil", async () => {
    const action = vi.fn(async (_id: number, _reason?: string) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <VoidButton id={7} action={action} requireReason />)
    clickTestEl(container.querySelector("button"))
    // tunggu dialog terbuka
    await act(async () => {})
    const textarea = document.querySelector("textarea[aria-label='Alasan pembatalan']")
    expect(textarea).not.toBeNull()
    const confirm = findButtonByText(document, "Batalkan Dokumen")
    clickTestEl(confirm)
    await act(async () => {})
    expect(action).not.toHaveBeenCalled()
    expect(toastCalls.err.some((m) => m.includes("wajib diisi"))).toBe(true)
    unmountTestUi(root, container)
  })

  it("tetap panggil aksi bila alasan terisi", async () => {
    const action = vi.fn(async (_id: number, _reason?: string) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <VoidButton id={7} action={action} requireReason />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    const textarea = document.querySelector("textarea[aria-label='Alasan pembatalan']") as HTMLTextAreaElement | null
    expect(textarea).not.toBeNull()
    // pola repo (reverse-payment-button.test.tsx): setter prototipe + event input
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
      setter.call(textarea, "  salah input pelanggan  ")
      textarea!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {})
    const confirm = findButtonByText(document, "Batalkan Dokumen")
    clickTestEl(confirm)
    await act(async () => { await Promise.resolve() })
    expect(action).toHaveBeenCalledTimes(1)
    expect(action.mock.calls[0][0]).toBe(7)
    expect(action.mock.calls[0][1]).toBe("salah input pelanggan")
    expect(toastCalls.ok.some((m) => m.includes("dibatalkan"))).toBe(true)
    unmountTestUi(root, container)
  })

  it("tanpa requireReason, alasan dikirim undefined", async () => {
    const action = vi.fn(async (_id: number, _reason?: string) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <VoidButton id={7} action={action} />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    const confirm = findButtonByText(document, "Batalkan Dokumen")
    clickTestEl(confirm)
    await act(async () => { await Promise.resolve() })
    expect(action).toHaveBeenCalledWith(7, undefined)
    unmountTestUi(root, container)
  })
})
