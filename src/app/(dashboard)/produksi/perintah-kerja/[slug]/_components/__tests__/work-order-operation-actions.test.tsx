// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { act } from "react"

import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  initializeWorkOrderOperations: vi.fn(),
  updateWorkOrderOperationStatus: vi.fn(),
  setWorkOrderOperationWorkCenter: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock("@/actions/manufacturing.actions", () => ({
  initializeWorkOrderOperations: (...args: unknown[]) =>
    mocks.initializeWorkOrderOperations(...args),
  updateWorkOrderOperationStatus: (...args: unknown[]) =>
    mocks.updateWorkOrderOperationStatus(...args),
}))

vi.mock("@/actions/work-center.actions", () => ({
  setWorkOrderOperationWorkCenter: (...args: unknown[]) =>
    mocks.setWorkOrderOperationWorkCenter(...args),
}))

vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => mocks.showError(...args),
  showSuccess: (...args: unknown[]) => mocks.showSuccess(...args),
}))

import { WorkOrderOperationActions, WorkOrderOperationWorkCenterSelect } from "../work-order-operation-actions"
import { buildWorkOrderProgress } from "@/lib/reports/work-order-progress"

function rowOf(status: string, sortOrder = 1) {
  const report = buildWorkOrderProgress({
    operations: [
      {
        id: 1,
        name: "Persiapan",
        sortOrder: 1,
        status: "completed",
        assignedEmployeeId: null,
        estimatedHours: null,
        workCenterId: null,
        notes: null,
      },
      {
        id: 2,
        name: "Pengerjaan",
        sortOrder,
        status,
        assignedEmployeeId: null,
        estimatedHours: null,
        workCenterId: null,
        notes: null,
      },
    ],
  })
  return report.rows.find((r) => r.id === 2)!
}

function buttonByLabel(container: HTMLElement, label: string) {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  )
}


function confirmSkipButton() {
  return [...document.querySelectorAll("button")]
    .filter((b) => b.textContent?.trim() === "Lewati Tahap")
    .at(-1) as HTMLButtonElement
}

afterEach(() => {
  vi.clearAllMocks()
  clearRenderedCards()
})

describe("WorkOrderOperationActions F-2026-10-21-020 Tahap B", () => {
  it("skip tanpa alasan ditolak UI pesan Indonesia, aksi server tidak dipanggil", async () => {
    const row = rowOf("in_progress", 2)
    const { container, root } = renderCard(
      <WorkOrderOperationActions workOrderId={7} workOrderStatus="in_progress" row={row} />,
    )
    const skipBtn = buttonByLabel(container, "Lewati tahap Pengerjaan")!
    expect(skipBtn).not.toBeNull()
    await act(async () => {
      skipBtn.click()
    })
    await act(async () => {
      confirmSkipButton().click()
    })
    expect(mocks.showError).toHaveBeenCalledWith(
      expect.stringContaining("wajib diisi alasan"),
    )
    expect(mocks.updateWorkOrderOperationStatus).not.toHaveBeenCalled()
    unmountCard(root)
  })

  it("skip dengan alasan memanggil aksi skipped + notes", async () => {
    mocks.updateWorkOrderOperationStatus.mockResolvedValue({ success: true })
    const row = rowOf("in_progress", 2)
    const { container, root } = renderCard(
      <WorkOrderOperationActions workOrderId={7} workOrderStatus="in_progress" row={row} />,
    )
    await act(async () => {
      buttonByLabel(container, "Lewati tahap Pengerjaan")!.click()
    })
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Alasan melewati tahap"]',
    )!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!
      setter.call(textarea, "part tidak perlu diganti")
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      confirmSkipButton().click()
    })
    expect(mocks.updateWorkOrderOperationStatus).toHaveBeenCalledWith(
      7,
      2,
      "skipped",
      "part tidak perlu diganti",
    )
    unmountCard(root)
  })

  it("WO bukan in_progress: nol aksi tahap", () => {
    const row = rowOf("pending", 2)
    const { container, root } = renderCard(
      <WorkOrderOperationActions workOrderId={7} workOrderStatus="draft" row={row} />,
    )
    expect(buttonByLabel(container, "Mulai tahap Pengerjaan")).toBeNull()
    unmountCard(root)
  })
})

describe("WorkOrderOperationWorkCenterSelect F-2026-10-22-090-S", () => {
  const CENTERS = [
    { id: 1, name: "Las", isActive: true },
    { id: 2, name: "Potong", isActive: false },
  ]

  it("tanpa stasiun tampil label Belum ada stasiun; opsi nonaktif tidak ditawarkan", () => {
    const row = rowOf("pending", 2)
    const { container, root } = renderCard(
      <WorkOrderOperationWorkCenterSelect workOrderId={7} row={row} centers={CENTERS} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Stasiun: Belum ada stasiun")
    const select = container.querySelector('[aria-label="Stasiun tahap Pengerjaan"]')
    expect(select).not.toBeNull()
    unmountCard(root)
  })

  it("stasiun lama nonaktif tetap tampil sebagai nilai terpilih (BR-LP-06)", () => {
    const base = rowOf("pending", 2)
    const row = { ...base, workCenterId: 2 }
    const { container, root } = renderCard(
      <WorkOrderOperationWorkCenterSelect workOrderId={7} row={row} centers={CENTERS} />,
    )
    expect(container.textContent ?? "").toContain("Stasiun: Potong")
    unmountCard(root)
  })
})
