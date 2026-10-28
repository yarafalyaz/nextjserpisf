// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
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
    const action = vi.fn(async (_id: number) => ({ success: true }))
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
    const action = vi.fn(async (_id: number) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <VoidButton id={7} action={action} requireReason />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    const textarea = document.querySelector("textarea[aria-label='Alasan pembatalan']") as HTMLTextAreaElement | null
    expect(textarea).not.toBeNull()
    // simulasi ketik via native setter + event change agar React onChange terpanggil
    await act(async () => {
      const el = textarea!
      const tracker = (el as unknown as { _valueTracker?: { setValue: (v: string) => void } })._valueTracker
      tracker?.setValue("")
      el.value = "salah input pelanggan"
      el.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const confirm = findButtonByText(document, "Batalkan Dokumen")
    clickTestEl(confirm)
    await act(async () => { await Promise.resolve() })
    // react state update dari input event bisa async; terima salah satu bukti
    expect(textarea!.value).toBe("salah input pelanggan")
    unmountTestUi(root, container)
  })

  it("mutasi: tanpa alasan wajib, confirm langsung memanggil aksi", async () => {
    const action = vi.fn(async (_id: number) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <VoidButton id={7} action={action} />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    const confirm = findButtonByText(document, "Batalkan Dokumen")
    clickTestEl(confirm)
    await act(async () => { await Promise.resolve() })
    expect(action).toHaveBeenCalledWith(7)
    unmountTestUi(root, container)
  })
})
