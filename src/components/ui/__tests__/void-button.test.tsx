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

  it("alasan terisi: aksi dipanggil dengan (id, alasan trim)", async () => {
    const action = vi.fn(async (_id: number, _reason?: string) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <VoidButton id={7} action={action} requireReason />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    const textarea = document.querySelector("textarea[aria-label='Alasan pembatalan']") as HTMLTextAreaElement | null
    expect(textarea).not.toBeNull()
    // simulasi ketik via setter prototipe agar React onChange terpanggil
    // (pola repo: reverse-payment-button.test.tsx)
    await act(async () => {
      const el = textarea!
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!
      setter.call(el, "  salah input pelanggan  ")
      el.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const confirm = findButtonByText(document, "Batalkan Dokumen")
    clickTestEl(confirm)
    await act(async () => {})
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
    await act(async () => {})
    expect(action).toHaveBeenCalledWith(7, undefined)
    unmountTestUi(root, container)
  })
})
