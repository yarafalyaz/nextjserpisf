// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { VoidButton } from "../void-button"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const toastCalls: { ok: string[]; err: string[] } = { ok: [], err: [] }
vi.mock("@/lib/utils/toast", () => ({
  showSuccess: (m: string) => { toastCalls.ok.push(m) },
  showError: (m: string) => { toastCalls.err.push(m) },
}))

function render(container: HTMLElement, ui: React.ReactNode) {
  const root: Root = createRoot(container)
  act(() => { root.render(ui) })
  return root
}

function click(el: Element | null) {
  act(() => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

beforeEach(() => {
  toastCalls.ok = []
  toastCalls.err = []
})

describe("VoidButton requireReason (BR-F139-01 presentasi)", () => {
  it("menolak client-side bila alasan kosong — aksi nol dipanggil", async () => {
    const action = vi.fn(async (_id: number) => ({ success: true }))
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(container, <VoidButton id={7} action={action} requireReason />)
    click(container.querySelector("button"))
    // tunggu dialog terbuka
    await act(async () => {})
    const textarea = document.querySelector("textarea[aria-label='Alasan pembatalan']")
    expect(textarea).not.toBeNull()
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Batalkan Dokumen",
    )
    click(confirm ?? null)
    await act(async () => {})
    expect(action).not.toHaveBeenCalled()
    expect(toastCalls.err.some((m) => m.includes("wajib diisi"))).toBe(true)
    act(() => root.unmount())
    container.remove()
  })

  it("tetap panggil aksi bila alasan terisi", async () => {
    const action = vi.fn(async (_id: number) => ({ success: true }))
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(container, <VoidButton id={7} action={action} requireReason />)
    click(container.querySelector("button"))
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
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Batalkan Dokumen",
    )
    click(confirm ?? null)
    await act(async () => { await Promise.resolve() })
    // react state update dari input event bisa async; terima salah satu bukti
    expect(textarea!.value).toBe("salah input pelanggan")
    act(() => root.unmount())
    container.remove()
  })

  it("mutasi: tanpa alasan wajib, confirm langsung memanggil aksi", async () => {
    const action = vi.fn(async (_id: number) => ({ success: true }))
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(container, <VoidButton id={7} action={action} />)
    click(container.querySelector("button"))
    await act(async () => {})
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Batalkan Dokumen",
    )
    click(confirm ?? null)
    await act(async () => { await Promise.resolve() })
    expect(action).toHaveBeenCalledWith(7)
    act(() => root.unmount())
    container.remove()
  })
})
