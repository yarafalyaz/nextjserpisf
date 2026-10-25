// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const completeMock = vi.fn()
const reopenMock = vi.fn()
const refreshMock = vi.fn()
const successMock = vi.fn()
const errorMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: refreshMock, push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/crm.actions", () => ({
  convertLead: vi.fn(),
  addLeadActivity: vi.fn(),
  completeLeadActivity: (leadId: number, activityId: number) => completeMock(leadId, activityId),
  reopenLeadActivity: (leadId: number, activityId: number) => reopenMock(leadId, activityId),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: (...a: unknown[]) => successMock(...(a as [])),
  showError: (...a: unknown[]) => errorMock(...(a as [])),
}))

import { LeadActivityCompletionButton } from "../lead-actions"

let root: Root | null = null
let container: HTMLDivElement | null = null

function render(props: {
  leadId?: number
  activityId?: number
  subject?: string | null
  completedAt: boolean
  canAct: boolean
}) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <LeadActivityCompletionButton
        leadId={props.leadId ?? 7}
        activityId={props.activityId ?? 42}
        subject={props.subject ?? "Follow-up penawaran"}
        completedAt={props.completedAt}
        canAct={props.canAct}
      />,
    )
  })
  return container
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.includes(label),
  )
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click()
    await new Promise((r) => setTimeout(r, 0))
  })
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

describe("LeadActivityCompletionButton F-2026-10-25-008-S (AC-LC-F1/F2)", () => {
  it("belum selesai + berhak: tombol 'Tandai Selesai' memanggil completeLeadActivity(leadId, activityId) tanpa tanggal klien", async () => {
    completeMock.mockResolvedValue({ success: true, id: 42 })
    render({ completedAt: false, canAct: true })

    const btn = findButton("Tandai Selesai")
    expect(btn).toBeDefined()
    expect(btn!.getAttribute("aria-label")).toBe("Tandai Selesai: Follow-up penawaran")
    expect(findButton("Batalkan Penanda Selesai")).toBeUndefined()

    await click(btn!)
    expect(completeMock).toHaveBeenCalledTimes(1)
    expect(completeMock).toHaveBeenCalledWith(7, 42)
    expect(completeMock.mock.calls[0]).toHaveLength(2)
    expect(reopenMock).not.toHaveBeenCalled()
    expect(successMock).toHaveBeenCalledWith("Aktivitas ditandai selesai")
    expect(errorMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it("sudah selesai + berhak: tombol 'Batalkan Penanda Selesai' memanggil reopenLeadActivity", async () => {
    reopenMock.mockResolvedValue({ success: true, id: 42 })
    render({ completedAt: true, canAct: true })

    const btn = findButton("Batalkan Penanda Selesai")
    expect(btn).toBeDefined()
    expect(btn!.getAttribute("aria-label")).toBe(
      "Batalkan Penanda Selesai: Follow-up penawaran",
    )
    expect(document.querySelectorAll("button")).toHaveLength(1)

    await click(btn!)
    expect(reopenMock).toHaveBeenCalledTimes(1)
    expect(reopenMock).toHaveBeenCalledWith(7, 42)
    expect(completeMock).not.toHaveBeenCalled()
    expect(successMock).toHaveBeenCalledWith("Penanda selesai aktivitas dibatalkan")
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it("tanpa hak (canAct=false): nol tombol untuk kedua keadaan — UI tidak menilai kepemilikan sendiri (AC-LC-F1)", () => {
    render({ completedAt: false, canAct: false })
    expect(document.querySelectorAll("button")).toHaveLength(0)
    expect(container!.textContent).toBe("")

    render({ completedAt: true, canAct: false })
    expect(document.querySelectorAll("button")).toHaveLength(0)
  })

  it("error server tampil verbatim lewat showError, tanpa refresh/sukses (AC-LC-F1)", async () => {
    completeMock.mockResolvedValue({
      success: false,
      error: "Anda hanya dapat menandai selesai aktivitas lead yang ditugaskan kepada Anda.",
    })
    render({ completedAt: false, canAct: true })

    await click(findButton("Tandai Selesai")!)
    expect(errorMock).toHaveBeenCalledTimes(1)
    expect(errorMock).toHaveBeenCalledWith(
      "Anda hanya dapat menandai selesai aktivitas lead yang ditugaskan kepada Anda.",
    )
    expect(successMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
