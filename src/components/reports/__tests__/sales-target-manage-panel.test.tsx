// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/actions/sales-target.actions", () => ({
  createSalesTarget: vi.fn(async () => ({ success: true, id: 9 })),
  updateSalesTarget: vi.fn(async () => ({ success: true, id: 1 })),
  deleteSalesTarget: vi.fn(async () => ({ success: true, id: 1 })),
}))

vi.mock("@/lib/utils/toast", () => ({ showError: vi.fn(), showSuccess: vi.fn() }))

import { SalesTargetManagePanel, type SalesTargetManageRow } from "../sales-target-manage-panel"
import { renderCard, unmountCard, clearRenderedCards, clickButtonByText } from "./card-test-utils"
import { act } from "react"
import { createSalesTarget } from "@/actions/sales-target.actions"
import { showError } from "@/lib/utils/toast"

afterEach(() => {
  clearRenderedCards()
  vi.clearAllMocks()
})

const ROW: SalesTargetManageRow = {
  id: 1,
  salesEmployeeId: 2,
  salesEmployeeName: "Sari",
  periodStart: new Date("2026-10-01T00:00:00Z"),
  periodEnd: new Date("2026-10-31T00:00:00Z"),
  targetAmount: 1_000_000,
  notes: "Target Oktober",
}

const EMPLOYEES = [
  { id: 2, name: "Sari" },
  { id: 1, name: "Budi" },
]

describe("SalesTargetManagePanel F-2026-10-22-088-S", () => {
  it("daftar target tampil + aksi kelola hanya bila canManage", () => {
    const { container, root } = renderCard(
      <SalesTargetManagePanel targets={[ROW]} employees={EMPLOYEES} canManage />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Kelola Target Penjualan")
    expect(text).toContain("Sari")
    expect(text).toContain("Rp 1.000.000")
    expect(text).toContain("Target Oktober")
    expect(text).toContain("+ Target Baru")
    expect(text).toContain("Ubah")
    expect(text).toContain("Nonaktifkan")
    unmountCard(root)
  })

  it("tanpa izin kelola: baca-saja, tanpa tombol mutasi", () => {
    const { container, root } = renderCard(
      <SalesTargetManagePanel targets={[ROW]} employees={EMPLOYEES} canManage={false} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Sari")
    expect(text).not.toContain("+ Target Baru")
    expect(text).not.toContain("Ubah")
    expect(text).not.toContain("Nonaktifkan")
    unmountCard(root)
  })

  it("kosong: teks belum ada target", () => {
    const { container, root } = renderCard(
      <SalesTargetManagePanel targets={[]} employees={EMPLOYEES} canManage />,
    )
    expect(container.textContent ?? "").toContain("Belum ada target penjualan.")
    unmountCard(root)
  })

  it("form baru terbuka dengan label terikat", () => {
    const { container, root } = renderCard(
      <SalesTargetManagePanel targets={[]} employees={EMPLOYEES} canManage />,
    )
    act(() => {
      clickButtonByText(container, "+ Target Baru")
    })
    expect(container.querySelector('form[aria-label="Form target penjualan baru"]')).not.toBeNull()
    expect(container.querySelector('label[for="sales-target-employee"]')?.textContent).toContain("Penjual")
    expect(container.querySelector('label[for="sales-target-amount"]')?.textContent).toContain("Target (Rp)")
    unmountCard(root)
  })

  it("error server tampil apa adanya lewat toast", async () => {
    vi.mocked(createSalesTarget).mockResolvedValueOnce({
      success: false,
      error: "Periode target bertumpukan dengan target 01/10/2026 s.d. 31/10/2026 untuk penjual yang sama",
    })
    const { container, root } = renderCard(
      <SalesTargetManagePanel targets={[]} employees={EMPLOYEES} canManage />,
    )
    act(() => {
      clickButtonByText(container, "+ Target Baru")
    })
    const form = container.querySelector('form[aria-label="Form target penjualan baru"]') as HTMLFormElement
    // jsdom: submit event langsung (pola repo)
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await vi.waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "Periode target bertumpukan dengan target 01/10/2026 s.d. 31/10/2026 untuk penjual yang sama",
      )
    })
    unmountCard(root)
  })
})
