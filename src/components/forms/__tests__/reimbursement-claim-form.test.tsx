// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { ReimbursementClaimForm } from "../reimbursement-claim-form"
import { showError, showSuccess } from "@/lib/utils/toast"

const createClaimMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/reimbursement.actions", () => ({
  createReimbursementClaim: (...args: unknown[]) => createClaimMock(...args),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

function mount(container: HTMLElement): Root {
  const root = createRoot(container)
  act(() => {
    root.render(
      <ReimbursementClaimForm
        categories={[{ id: 3, label: "Transportasi" }]}
        projects={[{ id: 7, name: "Proyek Alpha", documentNo: "PRJ-001" }]}
      />,
    )
  })
  return root
}

async function submitForm(container: HTMLElement) {
  const form = container.querySelector("form")!
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

describe("ReimbursementClaimForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("aria-label form + tanpa pilihan karyawan/akun GL (klaim mandiri)", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir ajukan klaim reimbursement")
    expect(form.getAttribute("aria-busy")).toBe("false")
    expect(container.querySelector('[name="employeeId"]')).toBeNull()
    expect(container.querySelector('[name="accountId"]')).toBeNull()
    expect(container.querySelector("#employeeId")).toBeNull()
    expect(container.querySelector("#accountId")).toBeNull()
    act(() => root.unmount())
    container.remove()
  })

  it("kandidat dobel: tampilkan kandidat + ajukan ulang dengan acknowledgeDuplicates=1", async () => {
    createClaimMock
      .mockResolvedValueOnce({
        success: false,
        error: "Ditemukan klaim serupa yang belum selesai (BR-RB-10).",
        duplicateCandidates: [{ id: 11, documentNo: "EXP-2026-0099", status: "draft" }],
      })
      .mockResolvedValueOnce({ success: true, id: 12, documentNo: "EXP-2026-0100", duplicateCandidates: [] })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)

    await submitForm(container)
    expect(vi.mocked(showError)).toHaveBeenCalledWith(
      "Ditemukan klaim serupa yang belum selesai (BR-RB-10).",
    )
    expect(container.textContent).toContain("EXP-2026-0099")

    const ackButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Tetap Ajukan"),
    )!
    expect(ackButton).toBeTruthy()
    await act(async () => {
      ackButton.click()
    })

    expect(createClaimMock).toHaveBeenCalledTimes(2)
    const secondFormData = createClaimMock.mock.calls[1][0] as FormData
    expect(secondFormData.get("acknowledgeDuplicates")).toBe("1")
    expect(secondFormData.get("employeeId")).toBeNull()
    expect(secondFormData.get("accountId")).toBeNull()
    expect(vi.mocked(showSuccess)).toHaveBeenCalledWith("Klaim EXP-2026-0100 berhasil diajukan")
    act(() => root.unmount())
    container.remove()
  })

  it("error server verbatim saat gagal tanpa kandidat", async () => {
    createClaimMock.mockResolvedValueOnce({
      success: false,
      error: "Akun Anda belum tertaut ke data karyawan — klaim mandiri tidak dapat diajukan.",
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mount(container)
    await submitForm(container)
    expect(vi.mocked(showError)).toHaveBeenCalledWith(
      "Akun Anda belum tertaut ke data karyawan — klaim mandiri tidak dapat diajukan.",
    )
    act(() => root.unmount())
    container.remove()
  })
})
