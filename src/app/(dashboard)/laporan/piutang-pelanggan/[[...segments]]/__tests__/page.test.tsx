// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  loadCustomerCreditExposure: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/reports/report-period", () => ({
  reportPeriodFromRoute: vi.fn(async () => ({
    start: new Date("2026-01-01T00:00:00Z"),
    end: new Date("2026-10-31T23:59:59Z"),
    slug: "2026",
  })),
}))

vi.mock("@/lib/reports/ledger-cash-data", () => ({
  loadCustomerCreditExposure: mocks.loadCustomerCreditExposure,
}))

vi.mock("@/components/reports/report-page-shell", () => ({
  ReportPageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/components/reports/report-period-filter", () => ({
  ReportPeriodFilter: () => null,
}))
vi.mock("@/components/reports/export-buttons", () => ({
  ExportButtons: () => null,
}))
vi.mock("@/components/reports/report-letterhead", () => ({
  ReportLetterhead: () => null,
}))
vi.mock("@/components/reports/report-narration", () => ({
  ReportNarration: () => null,
}))
vi.mock("@/components/reports/report-section", () => ({
  ReportSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  ReportKpiCard: () => null,
}))

import CustomerReceivablesPage from "../page"
import { renderPageNode, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

const ROW = {
  customerId: 1,
  customerName: "PT Uji",
  invoiceCount: 3,
  creditLimit: 100_000_000,
  outstanding: 40_000_000,
  overdue: 5_000_000,
  remainingCredit: 55_000_000,
  utilization: 45,
  openOrderAmount: 10_000_000,
  woUnrepresented: 2_000_000,
  confirmedDownPayment: 1_000_000,
  openCustomerCredit: 500_000,
  exposure: 45_000_000,
  grossExposure: 52_000_000,
  status: "ok" as const,
  avgPaymentDays: 21,
}

describe("Piutang per Pelanggan — baris TOTAL sejajar 14 kolom", () => {
  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.loadCustomerCreditExposure.mockResolvedValue({
      rows: [ROW],
      totalOutstanding: 40_000_000,
      totalOverdue: 5_000_000,
      totalCreditLimit: 100_000_000,
      totalExposure: 45_000_000,
      totalRemainingCredit: 55_000_000,
      portfolioDso: 21.5,
    })
  })
  afterEach(() => clearRenderedCards())

  it("TOTAL punya 14 sel; DSO portofolio di sel terakhir (Rata-rata Bayar)", async () => {
    const node = await CustomerReceivablesPage({
      params: Promise.resolve({ segments: [] }),
      searchParams: Promise.resolve({}),
    })
    const { container, root } = renderPageNode(node)
    const rows = [...container.querySelectorAll("tbody tr")]
    const totalRow = rows.find((tr) => tr.textContent?.includes("TOTAL"))
    expect(totalRow).toBeTruthy()
    const cells = [...(totalRow?.querySelectorAll("td") ?? [])]
    expect(cells).toHaveLength(14)
    expect(cells[1].textContent).toBe("3")
    expect(cells[7].textContent).toContain("10.000.000")
    expect(cells[11].textContent).toContain("45.000.000")
    expect(cells[12].textContent).toBe("")
    expect(cells[13].textContent).toBe("21.5")
    unmountCard(root)
  })
})
