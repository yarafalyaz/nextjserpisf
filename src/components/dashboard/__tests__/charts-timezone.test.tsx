// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}))

vi.mock("@/actions/disciplinary-deduction.actions", () => ({
  applyDisciplinaryDeductionAction: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/components/ui/shadcn/chart", () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}))

vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    AreaChart: ({
      data,
      children,
    }: {
      data?: Array<{ date: string; lunas: number; tagihan: number }>
      children?: React.ReactNode
    }) => (
      <div
        data-testid="area-chart"
        data-last-date={data?.at(-1)?.date ?? ""}
        data-last-lunas={String(data?.at(-1)?.lunas ?? 0)}
      >
        <svg>{children}</svg>
      </div>
    ),
    LineChart: Stub,
    BarChart: Stub,
    PieChart: Stub,
    Area: () => null,
    Line: () => null,
    Bar: () => null,
    Pie: () => null,
    Cell: () => null,
    Label: () => null,
    CartesianGrid: () => null,
    YAxis: () => null,
    XAxis: ({ tickFormatter }: { tickFormatter?: (v: string) => string }) => (
      <text data-testid="x-axis-sample">{tickFormatter ? tickFormatter("2026-11-19") : ""}</text>
    ),
  }
})

import { RevenueChart } from "../charts"
import { ApplyDisciplinaryDeductionButton } from "@/components/reports/apply-disciplinary-deduction-button"

let root: Root | null = null
const originalTz = process.env.TZ

beforeEach(() => {
  vi.useFakeTimers()
  // 2026-11-18T18:00:00Z = 2026-11-19 01:00:00 WIB (already Nov 19 in Jakarta, Nov 18 in New York/UTC)
  vi.setSystemTime(new Date("2026-11-18T18:00:00Z"))
  process.env.TZ = "America/New_York"
})

afterEach(() => {
  vi.useRealTimers()
  process.env.TZ = originalTz
  if (root) act(() => root!.unmount())
  root = null
  document.body.replaceChildren()
})

describe("WIB timezone safety for charts and client dates (H11)", () => {
  it("RevenueChart anchors 90d buckets to WIB today and formats day labels in Asia/Jakarta", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <RevenueChart
          data={[{ date: "2026-11-19", lunas: 250000, tagihan: 50000 }]}
        />,
      )
    })

    const chart = container.querySelector('[data-testid="area-chart"]')
    expect(chart?.getAttribute("data-last-date")).toBe("2026-11-19")
    expect(chart?.getAttribute("data-last-lunas")).toBe("250000")

    const tickSample = container.querySelector('[data-testid="x-axis-sample"]')?.textContent
    expect(tickSample).toMatch(/19\s+Nov/i)
  })

  it("ApplyDisciplinaryDeductionButton defaults transactionDate to WIB today regardless of local browser TZ", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <ApplyDisciplinaryDeductionButton
          decisionId={42}
          documentNo="KEP-042"
          defaultPeriod="2026-11"
        />,
      )
    })

    const openBtn = container.querySelector("button")!
    act(() => {
      openBtn.click()
    })

    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement | null
    expect(dateInput).not.toBeNull()
    expect(dateInput?.value).toBe("2026-11-19")
  })
})
