// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { act } from "react"
import { LoanWriteOffButton } from "../loan-write-off-button"
import { writeOffEmployeeLoan } from "@/actions/hrm.actions"
import {
  newTestContainer,
  renderTestUi,
  unmountTestUi,
} from "@/components/ui/__tests__/confirm-button-test-utils"

// Radix AlertDialogAction merender <button data-slot="alert-dialog-action">
// di dalam Slot Button — findButtonByText menemukan tombol pemicu terlebih
// dulu (teks sama), jadi konfirmasi diklik via slot aslinya.
function clickDialogConfirm() {
  const el = document.body.querySelector(
    "[data-slot='alert-dialog-action']",
  ) as HTMLElement
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

function clickOpener(container: HTMLElement) {
  act(() => {
    container.querySelector("button")!.click()
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
  })
}

const toast = vi.hoisted(() => ({ ok: [] as string[], err: [] as string[] }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: (m: string) => { toast.ok.push(m) },
  showError: (m: string) => { toast.err.push(m) },
}))

vi.mock("@/actions/hrm.actions", () => ({ writeOffEmployeeLoan: vi.fn() }))

const actionMock = vi.mocked(writeOffEmployeeLoan)

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

beforeEach(() => {
  toast.ok = []
  toast.err = []
  vi.clearAllMocks()
  actionMock.mockResolvedValue({ success: true, id: 5 })
})

describe("LoanWriteOffButton — BR-LOAN-08", () => {
  it("tombol ber-aria-label Indonesia + target sentuh ≥44px", () => {
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <LoanWriteOffButton loanId={7} remainingAmount={300000} />)
    const btn = container.querySelector("button[aria-label='Hapusbukukan pinjaman']")!
    expect(btn.textContent).toContain("Hapusbukukan")
    expect(btn.className).toContain("min-h-11")
    unmountTestUi(root, container)
  })

  it("dialog: tanggal + alasan wajib; tanpa tanggal = tolak lokal tanpa panggil aksi", async () => {
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <LoanWriteOffButton loanId={7} remainingAmount={300000} />)
    clickOpener(container)
    await flush()
    expect(document.body.textContent).toContain("Hapusbukukan sisa pinjaman ini?")
    expect(document.body.querySelector("#writeoff-date-7")).not.toBeNull()
    expect(document.body.querySelector("#writeoff-reason-7")).not.toBeNull()
    clickDialogConfirm()
    await flush()
    expect(toast.err).toContain("Tanggal write-off wajib diisi")
    expect(actionMock).not.toHaveBeenCalled()
    unmountTestUi(root, container)
  })

  it("submit valid memanggil aksi dengan loanId + tanggal + alasan; sukses → toast sukses", async () => {
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <LoanWriteOffButton loanId={7} remainingAmount={300000} />)
    clickOpener(container)
    await flush()
    act(() => {
      setNativeValue(
        document.body.querySelector("#writeoff-date-7") as HTMLInputElement,
        "2026-10-29",
      )
      setNativeValue(
        document.body.querySelector("#writeoff-reason-7") as HTMLTextAreaElement,
        "Tak tertagih, sudah 6 bulan",
      )
    })
    await act(async () => {})
    clickDialogConfirm()
    await flush()
    expect(actionMock).toHaveBeenCalledTimes(1)
    const sent = actionMock.mock.calls[0]![0] as FormData
    expect(sent.get("loanId")).toBe("7")
    expect(sent.get("writeOffDate")).toBe("2026-10-29")
    expect(sent.get("reason")).toBe("Tak tertagih, sudah 6 bulan")
    expect(toast.ok).toContain("Pinjaman berhasil dihapusbukukan")
    unmountTestUi(root, container)
  })

  it("error service tampil verbatim", async () => {
    actionMock.mockResolvedValueOnce({ success: false, error: "Pinjaman #7 sudah lunas — write-off ditolak." })
    const { container, root } = newTestContainer()
    renderTestUi(container, root, <LoanWriteOffButton loanId={7} remainingAmount={300000} />)
    clickOpener(container)
    await flush()
    act(() => {
      setNativeValue(
        document.body.querySelector("#writeoff-date-7") as HTMLInputElement,
        "2026-10-29",
      )
      setNativeValue(
        document.body.querySelector("#writeoff-reason-7") as HTMLTextAreaElement,
        "Coba ganda",
      )
    })
    await act(async () => {})
    clickDialogConfirm()
    await flush()
    expect(toast.err).toContain("Pinjaman #7 sudah lunas — write-off ditolak.")
    unmountTestUi(root, container)
  })
})
