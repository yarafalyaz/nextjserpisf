// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.scrollIntoView ??= () => {}

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { afterEach } from "vitest"

const approvalMock = vi.fn<(fd: FormData) => Promise<{ success: boolean; message?: string; error?: string }>>(async () => ({ success: true, message: "Persetujuan diajukan." }))
const postMock = vi.fn<(fd: FormData) => Promise<{ success: boolean; message?: string; error?: string; journalId?: number; journalNumber?: string }>>(async () => ({ success: true, message: "Terposting.", journalId: 9, journalNumber: "JRN-9" }))
const reverseMock = vi.fn<(fd: FormData) => Promise<{ success: boolean; message?: string; error?: string; journalId?: number; journalNumber?: string }>>(async () => ({ success: true, message: "Di-reversal.", journalId: 10, journalNumber: "JRN-10" }))
const successMock = vi.fn()
const errorMock = vi.fn()
const refreshMock = vi.fn()
const pushMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: refreshMock, push: pushMock, replace: vi.fn(), back: vi.fn() }
  },
}))
vi.mock("@/actions/year-end-closing.actions", () => ({
  requestYearEndClosingApprovalAction: (fd: FormData) => approvalMock(fd),
  postYearEndClosingAction: (fd: FormData) => postMock(fd),
  reverseYearEndClosingAction: (fd: FormData) => reverseMock(fd),
}))
vi.mock("@/lib/utils/toast", () => ({
  showSuccess: (...a: unknown[]) => successMock(...(a as [])),
  showError: (...a: unknown[]) => errorMock(...(a as [])),
}))

import { YearEndClosingPanel, type YearEndClosingPreviewView } from "../year-end-closing-panel"

const preview = (over: Partial<YearEndClosingPreviewView> = {}): YearEndClosingPreviewView => ({
  fiscalYear: 2025,
  closingDate: "2025-12-31T00:00:00.000Z",
  lines: [
    {
      accountId: 1,
      accountCode: "400001",
      accountName: "Pendapatan Jasa",
      accountType: "REVENUE",
      profitCenterId: null,
      profitCenterCode: null,
      balance: 1_000_000,
      closingDirection: "debit",
      closingAmount: 1_000_000,
    },
  ],
  retainedLines: [{ profitCenterId: null, profitCenterCode: null, netProfit: 1_000_000, direction: "credit" }],
  totalDebit: 1_000_000,
  totalCredit: 1_000_000,
  difference: 0,
  balanced: true,
  netProfit: 1_000_000,
  retainedEarningsMapped: true,
  alreadyClosed: false,
  ...over,
})

let root: Root | null = null
let container: HTMLDivElement | null = null

async function render(view: YearEndClosingPreviewView) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(<YearEndClosingPanel preview={view} />))
}

function buttons(): HTMLButtonElement[] {
  return [...container!.querySelectorAll<HTMLButtonElement>("button")]
}
function btn(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(label))
  if (!found) throw new Error(`tombol tidak ditemukan: ${label}`)
  return found
}
async function click(el: HTMLElement) {
  await act(async () => el.click())
}
function confirmBtn(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("[role='alertdialog'] button")].find(
    (b) => b.textContent?.trim() === label,
  )
  if (!found) throw new Error(`tombol konfirmasi tidak ditemukan: ${label}`)
  return found
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  container?.remove()
  document.body.innerHTML = ""
  root = null
  container = null
})

describe("YearEndClosingPanel", () => {
  it("posting aktif bila seimbang + terpetakan + belum ditutup; tampil baris builder apa adanya", async () => {
    await render(preview())
    expect(container!.textContent).toContain("Pendapatan Jasa")
    expect(container!.textContent).toContain("Laba ditahan (lawan penutup)")
    expect(btn("Posting penutup 2025").disabled).toBe(false)
    expect(container!.textContent).not.toContain("laba fiskal")
  })

  it("posting nonaktif + alasan bila laba ditahan belum dipetakan", async () => {
    await render(preview({ retainedEarningsMapped: false }))
    expect(btn("Posting penutup 2025").disabled).toBe(true)
    expect(container!.textContent).toContain("Akun laba ditahan belum dipetakan")
  })

  it("posting nonaktif + selisih verbatim bila belum seimbang", async () => {
    await render(preview({ balanced: false, difference: 5000, totalDebit: 1_005_000 }))
    expect(btn("Posting penutup 2025").disabled).toBe(true)
    expect(container!.textContent).toContain("Pratinjau belum seimbang")
  })

  it("sudah ditutup: hanya reversal tampil, posting hilang", async () => {
    await render(preview({ alreadyClosed: true }))
    expect(buttons().some((b) => b.textContent?.includes("Posting penutup"))).toBe(false)
    expect(btn("Reversal penutup 2025").disabled).toBe(false)
  })

  it("error backend tampil apa adanya lewat toast", async () => {
    postMock.mockResolvedValueOnce({ success: false, error: "konflik konkurensi — coba lagi" })
    await render(preview())
    await click(btn("Posting penutup 2025"))
    await click(confirmBtn("Posting penutup"))
    expect(postMock).toHaveBeenCalledTimes(1)
    const fd = postMock.mock.calls[0][0] as FormData
    expect(fd.get("fiscalYear")).toBe("2025")
    expect(errorMock).toHaveBeenCalledWith("konflik konkurensi — coba lagi")
    expect(successMock).not.toHaveBeenCalled()
  })

  it("sukses reversal: toast pesan backend + refresh", async () => {
    await render(preview({ alreadyClosed: true }))
    await click(btn("Reversal penutup 2025"))
    await click(confirmBtn("Reversal penutup"))
    expect(reverseMock).toHaveBeenCalledTimes(1)
    expect(successMock).toHaveBeenCalledWith("Di-reversal.")
    expect(refreshMock).toHaveBeenCalled()
  })
})

  it("E121-8: siklus repost sesudah reversal — tombol posting kembali saat alreadyClosed=false, aktif lagi sesudah reversal sukses", async () => {
    await render(preview({ alreadyClosed: true }))
    expect(buttons().some((b) => b.textContent?.includes("Posting penutup"))).toBe(false)
    expect(btn("Reversal penutup 2025").disabled).toBe(false)

    await click(btn("Reversal penutup 2025"))
    await click(confirmBtn("Reversal penutup"))
    expect(reverseMock).toHaveBeenCalledTimes(1)
    expect(successMock).toHaveBeenCalledWith("Di-reversal.")
    expect(refreshMock).toHaveBeenCalled()

    await render(preview({ alreadyClosed: false }))
    expect(btn("Posting penutup 2025").disabled).toBe(false)
  })

  it("E127-2: pesan backend penutup aktif lain tampil apa adanya — bukan P2002 mentah, sukses tidak diklaim", async () => {
    postMock.mockResolvedValueOnce({
      success: false,
      error: "Tahun fiskal 2025 sudah ditutup oleh jurnal penutup aktif lain. Koreksi hanya lewat reversal jurnal penutup.",
    })
    await render(preview())
    await click(btn("Posting penutup 2025"))
    await click(confirmBtn("Posting penutup"))
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(errorMock).toHaveBeenCalledWith(
      "Tahun fiskal 2025 sudah ditutup oleh jurnal penutup aktif lain. Koreksi hanya lewat reversal jurnal penutup.",
    )
    expect(successMock).not.toHaveBeenCalled()
    expect(errorMock.mock.calls.flat().join(" ")).not.toContain("P2002")
  })

  it("E127-1: repost gagal anti-dobel baca-lalu-tulis tampil apa adanya — konsumen tidak pernah mengganti jadi sukses", async () => {
    postMock.mockResolvedValueOnce({
      success: false,
      error: "Tahun fiskal 2025 sudah ditutup oleh jurnal JRN-2025-0099. Koreksi hanya lewat reversal jurnal penutup.",
    })
    await render(preview())
    await click(btn("Posting penutup 2025"))
    await click(confirmBtn("Posting penutup"))
    expect(errorMock).toHaveBeenCalledWith(
      "Tahun fiskal 2025 sudah ditutup oleh jurnal JRN-2025-0099. Koreksi hanya lewat reversal jurnal penutup.",
    )
    expect(successMock).not.toHaveBeenCalled()
  })
