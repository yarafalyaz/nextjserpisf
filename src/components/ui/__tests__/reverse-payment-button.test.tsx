// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { act } from "react"

const toast = vi.hoisted(() => ({ ok: [] as string[], err: [] as string[] }))
import { ReversePaymentButton } from "../reverse-payment-button"
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

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: (m: string) => { toast.ok.push(m) },
  showError: (m: string) => { toast.err.push(m) },
}))

beforeEach(() => {
  toast.ok = []
  toast.err = []
})

describe("ReversePaymentButton (GL-BR-003 K2 / FIN-BR-008)", () => {
  it("menolak client-side bila alasan kosong — aksi nol dipanggil", async () => {
    const action = vi.fn(async (_id: number, _reason: string) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <ReversePaymentButton id={7} action={action} />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    const confirm = findButtonByText(document, "Balikkan Pembayaran")
    clickTestEl(confirm)
    await act(async () => {})
    expect(action).not.toHaveBeenCalled()
    expect(toast.err.some((m) => m.includes("wajib diisi"))).toBe(true)
    unmountTestUi(root, container)
  })

  it("alasan terisi: aksi dipanggil dengan (id, alasan trim)", async () => {
    const action = vi.fn(async (_id: number, _reason: string) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <ReversePaymentButton id={7} action={action} />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    const textarea = document.querySelector("textarea[aria-label='Alasan pembalikan']") as HTMLTextAreaElement | null
    expect(textarea).not.toBeNull()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
      setter.call(textarea, "  salah input nominal  ")
      textarea!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {})
    const confirm = findButtonByText(document, "Balikkan Pembayaran")
    clickTestEl(confirm)
    await act(async () => {})
    expect(action).toHaveBeenCalledTimes(1)
    expect(action.mock.calls[0][0]).toBe(7)
    expect(action.mock.calls[0][1]).toBe("salah input nominal")
    expect(toast.ok.some((m) => m.includes("berhasil dibalik"))).toBe(true)
    unmountTestUi(root, container)
  })
})
