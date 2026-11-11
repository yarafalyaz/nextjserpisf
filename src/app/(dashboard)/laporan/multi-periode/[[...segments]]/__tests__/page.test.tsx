// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  groupBy: vi.fn(),
  accountFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    journalEntry: { groupBy: mocks.groupBy },
    account: { findMany: mocks.accountFindMany },
  },
}))

vi.mock("@/lib/reports/report-period", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/report-period")>()
  return {
    ...actual,
    reportPeriodFromRoute: vi.fn(async () => ({
      start: new Date("2026-10-01T00:00:00.000Z"),
      end: new Date("2026-10-31T23:59:59.999Z"),
      slug: "2026-10",
    })),
    splitReportSegments: (segments: string[]) => ({
      periodSegments: segments.slice(0, 1),
      filters: Object.fromEntries(
        Array.from({ length: Math.floor((segments.length - 1) / 2) }, (_, i) => [
          segments[1 + i * 2],
          segments[2 + i * 2],
        ]),
      ),
    }),
  }
})

vi.mock(
  "@/components/reports/report-page-shell",
  async () =>
    (await import("@/components/reports/__tests__/card-test-utils")).reportPageShellModule,
)
vi.mock("@/components/reports/report-letterhead", () => ({ ReportLetterhead: () => null }))
vi.mock("@/components/reports/report-narration", () => ({ ReportNarration: () => null }))
vi.mock("@/components/reports/export-buttons", () => ({ ExportButtons: () => null }))
vi.mock("@/components/reports/multi-period-filter", () => ({ MultiPeriodFilter: () => null }))

import MultiPeriodReportPage from "../page"
import { renderPageNode, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

let root: Root | undefined

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(undefined)
  mocks.accountFindMany.mockResolvedValue([
    { id: 1, code: "1101", name: "Kas", type: "ASSET" },
    { id: 2, code: "3101", name: "Modal", type: "EQUITY" },
  ])
})

afterEach(() => {
  if (root) unmountCard(root)
  root = undefined
  clearRenderedCards()
})

describe("Laporan Multi Periode: selisih sen", () => {
  it("KPI selisih menampilkan sen, bukan nol yang menyembunyikan ketidakseimbangan", async () => {
    // Aset 10.000.000,50 vs Modal 10.000.000 → selisih 0,50 harus terlihat.
    mocks.groupBy.mockResolvedValue([
      { accountId: 1, _sum: { debit: 10_000_000.5, credit: 0 } },
      { accountId: 2, _sum: { debit: 0, credit: 10_000_000 } },
    ])

    const node = await MultiPeriodReportPage({
      params: Promise.resolve({ segments: ["2026-10", "jenis", "neraca", "jumlah", "1"] }),
      searchParams: Promise.resolve({}),
    })
    const rendered = renderPageNode(node)
    root = rendered.root
    const text = rendered.container.textContent ?? ""

    expect(text).toContain("Selisih (harus 0)")
    expect(text).toContain("Rp 0,50")
    expect(text).not.toContain("Rp 0 ")
  })
})
