// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { act } from "react"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  hasPermission: vi.fn(),
  getSalesTargetAchievementReport: vi.fn(),
  listSalesTargets: vi.fn(),
  employeeFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
  hasPermission: mocks.hasPermission,
}))

vi.mock("@/actions/sales-target.actions", () => ({
  getSalesTargetAchievementReport: mocks.getSalesTargetAchievementReport,
  createSalesTarget: vi.fn(),
  updateSalesTarget: vi.fn(),
  deleteSalesTarget: vi.fn(),
}))

vi.mock("@/lib/reports/sales-target-achievement-data", () => ({
  listSalesTargets: mocks.listSalesTargets,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { employee: { findMany: mocks.employeeFindMany } },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/laporan/target-penjualan",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/components/reports/report-page-shell", () => ({
  ReportPageShell: ({ children, filter }: { children: React.ReactNode; filter?: React.ReactNode }) => (
    <div>
      {filter}
      {children}
    </div>
  ),
}))

vi.mock("@/components/reports/export-buttons", () => ({
  ExportButtons: () => null,
}))

import SalesTargetPage from "../page"
import { buildSalesTargetAchievement } from "@/lib/reports/sales-target-achievement"
import { renderPageNode } from "@/components/reports/__tests__/card-test-utils"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

async function renderPage() {
  const node = await SalesTargetPage({
    params: Promise.resolve({ segments: [] }),
    searchParams: Promise.resolve({}),
  })
  return renderPageNode(node)
}

const RANGE = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-10-31T23:59:59Z") }
const REPORT = buildSalesTargetAchievement({
  range: RANGE,
  targets: [
    {
      id: 1,
      salesEmployeeId: 2,
      salesEmployeeName: "Sari",
      periodStart: new Date("2026-10-01T00:00:00Z"),
      periodEnd: new Date("2026-10-31T00:00:00Z"),
      targetAmount: 1_000_000,
      notes: null,
      modifiedAfterPeriodStartAt: null,
    },
  ],
  invoices: [
    { salesEmployeeId: 2, salesEmployeeName: "Sari", date: new Date("2026-10-10T00:00:00Z"), grandTotal: 500_000 },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(undefined)
  mocks.hasPermission.mockResolvedValue(false)
  mocks.getSalesTargetAchievementReport.mockResolvedValue(REPORT)
  mocks.listSalesTargets.mockResolvedValue([])
  mocks.employeeFindMany.mockResolvedValue([])
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("F-2026-10-22-088-S halaman target vs pencapaian", () => {
  it("gerbang view_reports sebelum loader; tanpa kelola panel sembunyi", async () => {
    const { container, root } = await renderPage()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.getSalesTargetAchievementReport).toHaveBeenCalledTimes(1)
    expect(mocks.listSalesTargets).not.toHaveBeenCalled()
    const text = container.textContent ?? ""
    expect(text).toContain("Target vs Pencapaian Penjualan")
    expect(text).not.toContain("Kelola Target Penjualan")
    act(() => root.unmount())
  })

  it("tanpa izin lihat loader tidak dipanggil", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("redirect:/"))
    await expect(
      SalesTargetPage({
        params: Promise.resolve({ segments: [] }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("redirect:/")
    expect(mocks.getSalesTargetAchievementReport).not.toHaveBeenCalled()
  })

  it("dengan approve_sales_invoices: panel kelola + daftar target dimuat", async () => {
    mocks.hasPermission.mockResolvedValue(true)
    mocks.listSalesTargets.mockResolvedValue([
      {
        id: 1,
        salesEmployeeId: 2,
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-10-31T00:00:00Z"),
        targetAmount: 1_000_000,
        notes: null,
        updatedAt: new Date(),
        salesEmployee: { name: "Sari", isActive: true },
      },
    ])
    mocks.employeeFindMany.mockResolvedValue([{ id: 2, name: "Sari" }])
    const { container, root } = await renderPage()
    expect(mocks.hasPermission).toHaveBeenCalledWith("approve_sales_invoices")
    expect(container.textContent ?? "").toContain("Kelola Target Penjualan")
    act(() => root.unmount())
  })

  it("kontrak statis: nol hitung persen di page/kartu/panel", () => {
    const page = source("src/app/(dashboard)/laporan/target-penjualan/[[...segments]]/page.tsx")
    const card = source("src/components/reports/sales-target-achievement-card.tsx")
    const panel = source("src/components/reports/sales-target-manage-panel.tsx")
    expect(page).toContain('requirePermission("view_reports")')
    expect(page).toContain("getSalesTargetAchievementReport")
    for (const src of [page, card, panel]) {
      expect(src).not.toMatch(/achievementPercent\s*[*/]/)
      expect(src).not.toContain("prisma.salesTarget")
    }
    expect(card).not.toMatch(/gapAmount\s*[-+]/)
  })
})
