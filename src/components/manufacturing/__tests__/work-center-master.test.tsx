// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"

import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  createWorkCenter: vi.fn(),
  updateWorkCenter: vi.fn(),
  deactivateWorkCenter: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock("@/actions/work-center.actions", () => ({
  createWorkCenter: (...args: unknown[]) => mocks.createWorkCenter(...args),
  updateWorkCenter: (...args: unknown[]) => mocks.updateWorkCenter(...args),
  deactivateWorkCenter: (...args: unknown[]) => mocks.deactivateWorkCenter(...args),
}))

vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => mocks.showError(...args),
  showSuccess: (...args: unknown[]) => mocks.showSuccess(...args),
}))

import { WorkCenterMaster } from "../work-center-master"
import type { WorkCenterLoadPlanCenterInput } from "@/lib/reports/work-center-load-plan"

afterEach(() => {
  clearRenderedCards()
  vi.clearAllMocks()
})

const CENTERS: WorkCenterLoadPlanCenterInput[] = [
  { id: 1, name: "Las", capacityHoursPerDay: 8, parallelStations: 2, isActive: true, sortOrder: 0 },
  { id: 2, name: "Potong", capacityHoursPerDay: 8, parallelStations: 1, isActive: false, sortOrder: 1 },
]

function submitForm(container: HTMLElement) {
  const form = container.querySelector("form")!
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}

describe("WorkCenterMaster F-2026-10-22-090-S", () => {
  it("render daftar master + tombol Tambah Stasiun / Nonaktifkan Stasiun verbatim", () => {
    const { container, root } = renderCard(<WorkCenterMaster centers={CENTERS} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Las")
    expect(text).toContain("Potong")
    expect(text).toContain("Nonaktif")
    const buttons = Array.from(container.querySelectorAll("button")).map((b) => b.textContent)
    expect(buttons).toContain("Tambah Stasiun")
    expect(buttons).toContain("Nonaktifkan Stasiun")
    // Stasiun nonaktif tidak ditawari tombol nonaktifkan lagi.
    const deactivate = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent === "Nonaktifkan Stasiun",
    )
    expect(deactivate).toHaveLength(1)
    unmountCard(root)
  })

  it("daftar kosong tampil teks belum ada stasiun kerja", () => {
    const { container, root } = renderCard(<WorkCenterMaster centers={[]} />)
    expect(container.textContent ?? "").toContain("Belum ada stasiun kerja tercatat.")
    unmountCard(root)
  })

  it("submit tambah memanggil createWorkCenter; error server tampil verbatim", async () => {
    mocks.createWorkCenter.mockResolvedValue({
      success: false,
      error: "Nama stasiun aktif sudah digunakan",
    })
    const { container, root } = renderCard(<WorkCenterMaster centers={[]} />)
    submitForm(container)
    await vi.waitFor(() => expect(mocks.createWorkCenter).toHaveBeenCalledTimes(1))
    await vi.waitFor(() =>
      expect(mocks.showError).toHaveBeenCalledWith("Nama stasiun aktif sudah digunakan"),
    )
    expect(mocks.showSuccess).not.toHaveBeenCalled()
    unmountCard(root)
  })

  it("submit tambah sukses memanggil createWorkCenter dan refresh", async () => {
    mocks.createWorkCenter.mockResolvedValue({ success: true, id: 9 })
    const { container, root } = renderCard(<WorkCenterMaster centers={[]} />)
    submitForm(container)
    await vi.waitFor(() => expect(mocks.createWorkCenter).toHaveBeenCalledTimes(1))
    await vi.waitFor(() =>
      expect(mocks.showSuccess).toHaveBeenCalledWith("Stasiun kerja berhasil ditambahkan"),
    )
    expect(mocks.refresh).toHaveBeenCalled()
    unmountCard(root)
  })
})
