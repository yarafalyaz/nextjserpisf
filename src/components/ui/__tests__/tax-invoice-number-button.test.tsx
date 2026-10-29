// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { act } from "react"

const toast = vi.hoisted(() => ({ ok: [] as string[], err: [] as string[] }))

// Blok mock bersama confirm-button-test-utils: renderer daun diuji lewat
// helper itu, bukan jsdom ulang di tiap berkas (pola repo).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: (m: string) => { toast.ok.push(m) },
  showError: (m: string) => { toast.err.push(m) },
}))

import { TaxInvoiceNumberButton } from "../tax-invoice-number-button"
import {
  newTestContainer,
  renderTestUi,
  clickTestEl,
  unmountTestUi,
} from "./confirm-button-test-utils"

beforeEach(() => {
  toast.ok = []
  toast.err = []
})

describe("TaxInvoiceNumberButton (157-V Putusan 2)", () => {
  it("menolak client-side bila nomor kosong — aksi nol dipanggil", async () => {
    const action = vi.fn(async (_id: number, _fd: FormData) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <TaxInvoiceNumberButton id={7} action={action} />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    const candidates = Array.from(document.querySelectorAll("button")).filter(
      (b) => b.textContent === "Isi Nomor Faktur",
    )
    // tombol buka (luar) + tombol konfirmasi (dialog) berlabel sama
    const confirm = candidates[candidates.length - 1] ?? null
    expect(confirm).not.toBeNull()
    clickTestEl(confirm)
    expect(action).not.toHaveBeenCalled()
    expect(toast.err.some((m) => m.includes("wajib diisi"))).toBe(true)
    unmountTestUi(root, container)
  })

  it("mengirim FormData taxInvoiceNumber trim + sukses menutup dialog", async () => {
    const action = vi.fn(async (_id: number, _fd: FormData) => ({ success: true }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <TaxInvoiceNumberButton id={9} action={action} />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    const input = document.querySelector("input[name='taxInvoiceNumber']") as HTMLInputElement | null
    expect(input).not.toBeNull()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      setter.call(input, "  010.001-26.00000001  ")
      input!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {})
    const buttons = Array.from(document.querySelectorAll("button")).filter(
      (b) => b.textContent === "Isi Nomor Faktur",
    )
    const confirm = buttons[buttons.length - 1]
    clickTestEl(confirm)
    await act(async () => {})
    expect(action).toHaveBeenCalledTimes(1)
    expect(action.mock.calls[0][0]).toBe(9)
    const fd = action.mock.calls[0][1] as FormData
    expect(fd.get("taxInvoiceNumber")).toBe("010.001-26.00000001")
    expect(toast.ok.some((m) => m.includes("berhasil diisi"))).toBe(true)
    unmountTestUi(root, container)
  })

  it("error service tampil verbatim", async () => {
    const msg = "Nomor faktur pajak tidak valid — hanya huruf, angka, spasi, titik, dan strip (maks 50 karakter)."
    const action = vi.fn(async (_id: number, _fd: FormData) => ({ success: false as const, error: msg }))
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <TaxInvoiceNumberButton id={11} action={action} />)
    clickTestEl(container.querySelector("button"))
    await act(async () => {})
    const input = document.querySelector("input[name='taxInvoiceNumber']") as HTMLInputElement | null
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      setter.call(input, "!!!")
      input!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {})
    const buttons = Array.from(document.querySelectorAll("button")).filter(
      (b) => b.textContent === "Isi Nomor Faktur",
    )
    clickTestEl(buttons[buttons.length - 1])
    await act(async () => {})
    expect(toast.err).toContain(msg)
    unmountTestUi(root, container)
  })
})
