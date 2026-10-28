// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { ReversePaymentButton } from "../reverse-payment-button"

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

describe("ReversePaymentButton (GL-BR-003 K2 / FIN-BR-008)", () => {
  it("menolak client-side bila alasan kosong — aksi nol dipanggil", async () => {
    const action = vi.fn(async (_id: number, _reason: string) => ({ success: true }))
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(container, <ReversePaymentButton id={7} action={action} />)
    click(container.querySelector("button"))
    await act(async () => {})
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Balikkan Pembayaran",
    )
    click(confirm ?? null)
    await act(async () => {})
    expect(action).not.toHaveBeenCalled()
    expect(toastCalls.err.some((m) => m.includes("wajib diisi"))).toBe(true)
    act(() => root.unmount())
    container.remove()
  })

  it("alasan terisi: aksi dipanggil dengan (id, alasan trim)", async () => {
    const action = vi.fn(async (_id: number, _reason: string) => ({ success: true }))
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(container, <ReversePaymentButton id={7} action={action} />)
    click(container.querySelector("button"))
    await act(async () => {})
    const textarea = document.querySelector("textarea[aria-label='Alasan pembalikan']") as HTMLTextAreaElement | null
    expect(textarea).not.toBeNull()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
      setter.call(textarea, "  salah input nominal  ")
      textarea!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {})
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Balikkan Pembayaran",
    )
    click(confirm ?? null)
    await act(async () => {})
    expect(action).toHaveBeenCalledTimes(1)
    expect(action.mock.calls[0][0]).toBe(7)
    expect(action.mock.calls[0][1]).toBe("salah input nominal")
    expect(toastCalls.ok.some((m) => m.includes("berhasil dibalik"))).toBe(true)
    act(() => root.unmount())
    container.remove()
  })
})
