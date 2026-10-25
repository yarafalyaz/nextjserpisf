// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { ReimbursementVerifyPanel } from "../reimbursement-verify-panel"
import { showError, showSuccess } from "@/lib/utils/toast"

const setAccountsMock = vi.fn().mockResolvedValue({ success: true })
const approveMock = vi.fn().mockResolvedValue({ success: true })
const rejectMock = vi.fn().mockResolvedValue({ success: true })
const paidMock = vi.fn().mockResolvedValue({ success: true })

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/reimbursement.actions", () => ({
  setReimbursementClaimAccounts: (...args: unknown[]) => setAccountsMock(...args),
}))

vi.mock("@/actions/finance.actions", () => ({
  approveExpense: (...args: unknown[]) => approveMock(...args),
  rejectExpense: (...args: unknown[]) => rejectMock(...args),
  markExpensePaid: (...args: unknown[]) => paidMock(...args),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

const accounts = [
  { id: 1, code: "5100", name: "Beban Transportasi", type: "EXPENSE" },
  { id: 2, code: "1100", name: "Kas", type: "ASSET" },
]

function mount(container: HTMLElement, props: Partial<Parameters<typeof ReimbursementVerifyPanel>[0]> = {}): Root {
  const root = createRoot(container)
  act(() => {
    root.render(
      <ReimbursementVerifyPanel
        expenseId={42}
        status="draft"
        isReimbursementClaim
        accountId={1}
        paidFromAccountId={null}
        accounts={accounts}
        {...props}
      />,
    )
  })
  return root
}

function buttonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  )!
}

describe("ReimbursementVerifyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAccountsMock.mockResolvedValue({ success: true })
    approveMock.mockResolvedValue({ success: true })
  })

  it("bukan klaim: panel tidak dirender", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container, { isReimbursementClaim: false })
    expect(container.querySelector('[aria-label="Verifikasi klaim reimbursement"]')).toBeNull()
    act(() => root.unmount())
    container.remove()
  })

  it("approve klaim draft: tetapkan akun dulu, baru approveExpense", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    await act(async () => {
      buttonByText(container, "Setujui Klaim").click()
    })
    expect(setAccountsMock).toHaveBeenCalledTimes(1)
    expect(setAccountsMock.mock.calls[0][0]).toBe(42)
    expect((setAccountsMock.mock.calls[0][1] as FormData).get("accountId")).toBe("1")
    expect(approveMock).toHaveBeenCalledWith(42)
    expect(vi.mocked(showSuccess)).toHaveBeenCalledWith("Klaim disetujui")
    act(() => root.unmount())
    container.remove()
  })

  it("error server verbatim saat approve ditolak (bukti/SoD)", async () => {
    approveMock.mockResolvedValueOnce({
      success: false,
      error: "Klaim reimbursement tidak dapat disetujui: bukti pengeluaran belum tertaut. (BR-RB-04).",
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    await act(async () => {
      buttonByText(container, "Setujui Klaim").click()
    })
    expect(vi.mocked(showError)).toHaveBeenCalledWith(
      "Klaim reimbursement tidak dapat disetujui: bukti pengeluaran belum tertaut. (BR-RB-04).",
    )
    act(() => root.unmount())
    container.remove()
  })

  it("status approved: hanya Tandai Dibayar, tanpa form akun", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container, { status: "approved" })
    expect(buttonByText(container, "Tandai Dibayar")).toBeTruthy()
    expect(buttonByText(container, "Tetapkan Akun")).toBeFalsy()
    expect(buttonByText(container, "Setujui Klaim")).toBeFalsy()
    act(() => root.unmount())
    container.remove()
  })

  it("blocker gerbang server: notice verbatim + Tandai Dibayar disabled, klik tidak memanggil markExpensePaid", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container, {
      status: "approved",
      paymentBlockerNotice: "Menunggu perbaikan gerbang (t_b228bac8)",
    })
    expect(container.textContent).toContain("Menunggu perbaikan gerbang (t_b228bac8)")
    const paidButton = buttonByText(container, "Tandai Dibayar")
    expect(paidButton).toBeTruthy()
    expect((paidButton as HTMLButtonElement).disabled).toBe(true)
    await act(async () => {
      paidButton.click()
    })
    expect(paidMock).not.toHaveBeenCalled()
    act(() => root.unmount())
    container.remove()
  })

  it("blocker gerbang server: Setujui Klaim disabled, Tolak Klaim tetap aktif", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container, {
      status: "draft",
      paymentBlockerNotice: "Menunggu perbaikan gerbang (t_b228bac8)",
    })
    expect((buttonByText(container, "Setujui Klaim") as HTMLButtonElement).disabled).toBe(true)
    expect((buttonByText(container, "Tolak Klaim") as HTMLButtonElement).disabled).toBe(false)
    act(() => root.unmount())
    container.remove()
  })

  it("tanpa blocker: Tandai Dibayar aktif (kontrol)", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container, { status: "approved", paymentBlockerNotice: null })
    expect((buttonByText(container, "Tandai Dibayar") as HTMLButtonElement).disabled).toBe(false)
    expect(container.textContent).not.toContain("Menunggu perbaikan gerbang")
    act(() => root.unmount())
    container.remove()
  })
})
