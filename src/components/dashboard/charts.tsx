"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/shadcn/chart"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/shadcn/toggle-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select"
import { statusLabel } from "@/lib/utils/status-labels"

type RevenueData = { date: string; lunas: number; tagihan: number }
type StatusData = { name: string; value: number }
type CustomerData = { name: string; revenue: number }

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
]

function formatDayLabel(date: string) {
  return new Date(date).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  })
}
function formatChartDateLabel(value: React.ReactNode) {
  if (typeof value !== "string" && typeof value !== "number") return value
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  })
}

function rupiahShort(v: number) {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}M`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}jt`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`
  return String(v)
}

const revenueConfig = {
  tagihan: { label: "Tagihan", color: "var(--chart-1)" },
  lunas: { label: "Lunas", color: "var(--chart-2)" },
} satisfies ChartConfig

function RevenueAxes() {
  return (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" opacity={0.6} />
      <XAxis
        dataKey="date"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        minTickGap={32}
        fontSize={11}
        tickFormatter={formatDayLabel}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={42}
        fontSize={11}
        tickFormatter={rupiahShort}
      />
    </>
  )
}

function RevenueTooltip({ cursor }: { cursor: Record<string, unknown> }) {
  return (
    <ChartTooltip
      cursor={cursor}
      content={
        <ChartTooltipContent
          labelFormatter={formatChartDateLabel}
          formatter={(value, name) => (
            <>
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: `var(--color-${name})` }}
              />
              {revenueConfig[name as keyof typeof revenueConfig]?.label || name}
              <div className="ml-auto font-mono font-medium tabular-nums text-foreground">
                Rp {Number(value).toLocaleString("id-ID")}
              </div>
            </>
          )}
          indicator="dot"
        />
      }
    />
  )
}

export function RevenueChart({ data }: { data: RevenueData[] }) {
  const [timeRange, setTimeRange] = React.useState("90d")
  const [chartType, setChartType] = React.useState<"area" | "line" | "bar">("area")
  const [activeSeries, setActiveSeries] = React.useState<"all" | "lunas" | "tagihan">("all")

  // Generate continuous daily timeline so days without sales dip to 0,
  // creating the natural up-and-down trend line curve (peaks & valleys)
  const filteredData = React.useMemo(() => {
    let days = 90
    if (timeRange === "30d") days = 30
    else if (timeRange === "7d") days = 7

    // Putaran 97: jendela selalu berjangkar HARI INI. Jangkar lama (tanggal
    // data terakhir) membuat grafik berhenti di transaksi terakhir dan
    // menyembunyikan kekosongan penjualan sesudahnya.
    const refDate = new Date()
    refDate.setHours(0, 0, 0, 0)

    const dataMap = new Map<string, { lunas: number; tagihan: number }>()
    for (const item of data) {
      if (!item.date) continue
      const dateKey = item.date.slice(0, 10)
      const prev = dataMap.get(dateKey) || { lunas: 0, tagihan: 0 }
      dataMap.set(dateKey, {
        lunas: prev.lunas + (Number(item.lunas) || 0),
        tagihan: prev.tagihan + (Number(item.tagihan) || 0),
      })
    }

    const result: RevenueData[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(refDate)
      d.setDate(d.getDate() - i)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, "0")
      const day = String(d.getDate()).padStart(2, "0")
      const dateKey = `${year}-${month}-${day}`

      const val = dataMap.get(dateKey) || { lunas: 0, tagihan: 0 }
      result.push({
        date: dateKey,
        lunas: val.lunas,
        tagihan: val.tagihan,
      })
    }
    return result
  }, [data, timeRange])

  const totals = React.useMemo(() => {
    return filteredData.reduce(
      (acc, curr) => {
        acc.lunas += curr.lunas || 0
        acc.tagihan += curr.tagihan || 0
        return acc
      },
      { lunas: 0, tagihan: 0 }
    )
  }, [filteredData])

  const showLunas = activeSeries === "all" || activeSeries === "lunas"
  const showTagihan = activeSeries === "all" || activeSeries === "tagihan"

  const renderChartElements = () => {
    if (chartType === "line") {
      return (
        <LineChart data={filteredData}>
          <RevenueAxes />
          <RevenueTooltip cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }} />
          {showTagihan && (
            <Line
              dataKey="tagihan"
              type="monotone"
              stroke="var(--color-tagihan)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 1.5 }}
            />
          )}
          {showLunas && (
            <Line
              dataKey="lunas"
              type="monotone"
              stroke="var(--color-lunas)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 1.5 }}
            />
          )}
        </LineChart>
      )
    }

    if (chartType === "bar") {
      return (
        <BarChart data={filteredData}>
          <RevenueAxes />
          <RevenueTooltip cursor={{ fill: "var(--muted)", opacity: 0.25 }} />
          {showTagihan && (
            <Bar
              dataKey="tagihan"
              fill="var(--color-tagihan)"
              radius={[3, 3, 0, 0]}
            />
          )}
          {showLunas && (
            <Bar
              dataKey="lunas"
              fill="var(--color-lunas)"
              radius={[3, 3, 0, 0]}
            />
          )}
        </BarChart>
      )
    }

    return (
      <AreaChart data={filteredData}>
        <defs>
          <linearGradient id="fillTagihan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-tagihan)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--color-tagihan)" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="fillLunas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-lunas)" stopOpacity={0.22} />
            <stop offset="95%" stopColor="var(--color-lunas)" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <RevenueAxes />
        <RevenueTooltip cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }} />
        {showTagihan && (
          <Area
            dataKey="tagihan"
            type="monotone"
            fill="url(#fillTagihan)"
            stroke="var(--color-tagihan)"
            strokeWidth={2}
            activeDot={{ r: 5, strokeWidth: 1.5 }}
          />
        )}
        {showLunas && (
          <Area
            dataKey="lunas"
            type="monotone"
            fill="url(#fillLunas)"
            stroke="var(--color-lunas)"
            strokeWidth={2}
            activeDot={{ r: 5, strokeWidth: 1.5 }}
          />
        )}
      </AreaChart>
    )
  }

  return (
    <Card className="h-full @container/chart">
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <CardTitle id="revenue-chart-title">Tren Pendapatan</CardTitle>
            <CardDescription className="mt-0.5">
              <span className="hidden @[540px]/chart:block">
                Perbandingan tagihan diterbitkan dan pembayaran lunas harian
              </span>
              <span className="@[540px]/chart:hidden">Tagihan vs lunas</span>
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Chart type selector */}
            <ToggleGroup
              type="single"
              value={chartType}
              onValueChange={(v) => v && setChartType(v as "area" | "line" | "bar")}
              variant="outline"
              size="sm"
              aria-label="Tipe Grafik"
              className="*:data-[slot=toggle-group-item]:!px-2.5 *:data-[slot=toggle-group-item]:text-xs"
            >
              <ToggleGroupItem value="area" aria-label="Grafik Area">
                Area
              </ToggleGroupItem>
              <ToggleGroupItem value="line" aria-label="Grafik Garis">
                Garis
              </ToggleGroupItem>
              <ToggleGroupItem value="bar" aria-label="Grafik Batang">
                Batang
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Time range selector */}
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(v) => v && setTimeRange(v)}
              variant="outline"
              size="sm"
              aria-label="Pilih rentang waktu"
              className="hidden *:data-[slot=toggle-group-item]:!px-2.5 *:data-[slot=toggle-group-item]:text-xs @[680px]/chart:flex"
            >
              <ToggleGroupItem value="90d">90H</ToggleGroupItem>
              <ToggleGroupItem value="30d">30H</ToggleGroupItem>
              <ToggleGroupItem value="7d">7H</ToggleGroupItem>
            </ToggleGroup>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger
                className="flex w-32 @[680px]/chart:hidden"
                size="sm"
                aria-label="Pilih rentang waktu"
              >
                <SelectValue placeholder="3 bulan" />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                <SelectItem value="90d" className="rounded-md">
                  3 bulan terakhir
                </SelectItem>
                <SelectItem value="30d" className="rounded-md">
                  30 hari terakhir
                </SelectItem>
                <SelectItem value="7d" className="rounded-md">
                  7 hari terakhir
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Metric summary selector strip */}
        {filteredData.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
            <button
              type="button"
              onClick={() => setActiveSeries("all")}
              aria-pressed={activeSeries === "all"}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition-colors duration-150 ${
                activeSeries === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              Semua Data
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveSeries((prev) => (prev === "lunas" ? "all" : "lunas"))
              }
              aria-pressed={showLunas && activeSeries !== "all"}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition-colors duration-150 ${
                showLunas && activeSeries !== "all"
                  ? "border-[var(--chart-2)] bg-[var(--chart-2)] text-background"
                  : activeSeries === "all"
                  ? "border-border bg-background text-foreground hover:bg-muted/60"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="size-2 rounded-full bg-[var(--chart-2)]" />
              <span className="text-muted-foreground">Lunas:</span>
              <span className="font-semibold tabular-nums">Rp {rupiahShort(totals.lunas)}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveSeries((prev) => (prev === "tagihan" ? "all" : "tagihan"))
              }
              aria-pressed={showTagihan && activeSeries !== "all"}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition-colors duration-150 ${
                showTagihan && activeSeries !== "all"
                  ? "border-[var(--chart-1)] bg-[var(--chart-1)] text-background"
                  : activeSeries === "all"
                  ? "border-border bg-background text-foreground hover:bg-muted/60"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="size-2 rounded-full bg-[var(--chart-1)]" />
              <span className="text-muted-foreground">Tagihan:</span>
              <span className="font-semibold tabular-nums">Rp {rupiahShort(totals.tagihan)}</span>
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-3 pt-2 sm:px-5 sm:pt-3">
        {filteredData.length === 0 ? (
          <p
            role="status"
            className="flex h-[260px] items-center justify-center text-sm text-muted-foreground"
          >
            Belum ada data pendapatan
          </p>
        ) : (
          <ChartContainer
            config={revenueConfig}
            className="aspect-auto h-[260px] w-full"
            role="img"
            aria-labelledby="revenue-chart-title"
            aria-describedby="revenue-chart-desc"
          >
            <span id="revenue-chart-desc" className="sr-only">
              Chart membandingkan total tagihan diterbitkan dengan pembayaran
              lunas untuk rentang {timeRange === "7d" ? "7 hari" : timeRange === "30d" ? "30 hari" : "3 bulan"} terakhir. Total {filteredData.length} titik data.
            </span>
            {renderChartElements()}
            <table className="sr-only">
              <caption>Tren Pendapatan — Tagihan vs Lunas</caption>
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Tagihan (Rp)</th>
                  <th scope="col">Lunas (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((d) => (
                  <tr key={d.date}>
                    <th scope="row">{d.date}</th>
                    <td>{d.tagihan.toLocaleString("id-ID")}</td>
                    <td>{d.lunas.toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  posted: "Menunggu Pembayaran",
  partial: "Sebagian",
  paid: "Lunas",
  overdue: "Jatuh Tempo",
  cancelled: "Dibatalkan",
}

const STATUS_COLOR_MAP: Record<string, string> = {
  paid: "#10b981",       // Emerald — Lunas
  posted: "#2563eb",     // Blue — Menunggu Pembayaran / Diterbitkan
  partial: "#d97706",    // Amber — Sebagian
  overdue: "#e11d48",    // Rose — Jatuh Tempo
  cancelled: "#dc2626",  // Red — Dibatalkan
  draft: "#71717a",      // Zinc — Draft
}

const STATUS_PRIORITY: Record<string, number> = {
  paid: 1,
  posted: 2,
  partial: 3,
  overdue: 4,
  draft: 5,
  cancelled: 6,
}

export function SalesStatusChart({ data }: { data: StatusData[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  const chartData = React.useMemo(() => {
    return [...data]
      .sort((a, b) => {
        const pa = STATUS_PRIORITY[a.name] ?? 99
        const pb = STATUS_PRIORITY[b.name] ?? 99
        return pa !== pb ? pa - pb : b.value - a.value
      })
      .map((d, i) => ({
        ...d,
        label: INVOICE_STATUS_LABELS[d.name] ?? statusLabel(d.name),
        fill: STATUS_COLOR_MAP[d.name] ?? PIE_COLORS[i % PIE_COLORS.length],
        pct: total > 0 ? Math.round((d.value / total) * 100) : 0,
        exactPct: total > 0 ? (d.value / total) * 100 : 0,
      }))
  }, [data, total])

  const config: ChartConfig = React.useMemo(
    () =>
      Object.fromEntries(
        chartData.map((d) => [d.name, { label: d.label, color: d.fill }])
      ),
    [chartData]
  )

  return (
    <Card className="h-full gap-0 py-0">
      <CardHeader className="border-b py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle id="sales-status-chart-title">Faktur per Status</CardTitle>
            <CardDescription className="mt-0.5">
              Komposisi status dokumen faktur penjualan
            </CardDescription>
          </div>
          {total > 0 && (
            <div className="text-right">
              <div className="text-xl leading-none font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                {total}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">Total faktur</div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-4 py-4">
        {total === 0 ? (
          <p
            role="status"
            className="flex h-[240px] items-center justify-center text-sm text-muted-foreground"
          >
            Belum ada data faktur
          </p>
        ) : (
          <>
            {/* Proportional Multi-Segment Bar + Compact Donut */}
            <div className="flex flex-col gap-4">
              {/* Segmented distribution bar (Stripe / Linear style) */}
              <div>
                <div
                  className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted p-0.5"
                  aria-hidden="true"
                >
                  {chartData.map((item) =>
                    item.value > 0 ? (
                      <div
                        key={item.name}
                        className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-200"
                        style={{
                          width: `${Math.max(item.exactPct, 4)}%`,
                          backgroundColor: item.fill,
                        }}
                        title={`${item.label}: ${item.value} (${item.pct}%)`}
                      />
                    ) : null
                  )}
                </div>
              </div>

              {/* Compact Donut Chart */}
              <ChartContainer
                config={config}
                className="mx-auto aspect-square h-[148px] max-w-[148px]"
                role="img"
                aria-labelledby="sales-status-chart-title"
                aria-describedby="sales-status-chart-desc"
              >
                <span id="sales-status-chart-desc" className="sr-only">
                  Pie chart distribusi {total} faktur berdasarkan status.
                  {chartData
                    .map((d) => ` ${d.label}: ${d.value} (${d.pct}%).`)
                    .join("")}
                </span>
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={44}
                    outerRadius={66}
                    paddingAngle={2}
                    strokeWidth={2}
                    stroke="var(--card)"
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                          const paidItem = chartData.find((d) => d.name === "paid")
                          const paidPct = paidItem ? paidItem.pct : 0
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) - 4}
                                className="fill-foreground text-base font-semibold tabular-nums"
                              >
                                {paidPct}%
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 12}
                                className="fill-muted-foreground text-[10px]"
                              >
                                Lunas
                              </tspan>
                            </text>
                          )
                        }
                        return null
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
            </div>

            {/* Structured Breakdown List */}
            <dl className="divide-y divide-border/60 border-t pt-2 text-xs">
              {chartData.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-3 py-2 first:pt-1 last:pb-0"
                >
                  <dt className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: item.fill }}
                      aria-hidden="true"
                    />
                    <span className="truncate font-medium text-foreground">
                      {item.label}
                    </span>
                  </dt>
                  <dd className="flex shrink-0 items-center gap-2.5 tabular-nums">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {item.value}
                    </span>
                    <span className="w-9 rounded bg-muted/70 px-1.5 py-0.5 text-right font-mono text-[11px] text-muted-foreground">
                      {item.pct}%
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            <table className="sr-only">
              <caption>Faktur per Status</caption>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Jumlah</th>
                  <th scope="col">Persentase</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((item) => (
                  <tr key={item.name}>
                    <th scope="row">{item.label}</th>
                    <td>{item.value}</td>
                    <td>{item.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function TopCustomersChart({ data }: { data: CustomerData[] }) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)

  const totalRevenue = React.useMemo(() => {
    return data.reduce((sum, d) => sum + (d.revenue || 0), 0)
  }, [data])

  const chartData = React.useMemo(() => {
    return data.map((d, index) => {
      const percentage = totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0
      const rankOpacity = Math.max(0.45, 1 - index * 0.14)
      return {
        ...d,
        rank: index + 1,
        percentage: percentage.toFixed(1),
        rankOpacity,
      }
    })
  }, [data, totalRevenue])

  const config = {
    revenue: { label: "Pendapatan", color: "var(--chart-2)" },
  } satisfies ChartConfig

  return (
    <Card className="h-full @container/chart">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Pelanggan Teratas</CardTitle>
            <CardDescription className="mt-0.5">
              5 pelanggan dengan nilai faktur tertinggi tahun ini
            </CardDescription>
          </div>
          {totalRevenue > 0 && (
            <div className="text-right">
              <span className="block text-[11px] text-muted-foreground">Total 5 Teratas</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                Rp {rupiahShort(totalRevenue)}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p
            role="status"
            className="flex h-[240px] items-center justify-center text-sm text-muted-foreground"
          >
            Belum ada data pelanggan
          </p>
        ) : (
          <ChartContainer config={config} className="h-[240px] w-full">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 4, right: 20, top: 8, bottom: 8 }}
              onMouseMove={(state) => {
                if (typeof state?.activeTooltipIndex === "number") {
                  setActiveIndex(state.activeTooltipIndex)
                }
              }}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" opacity={0.6} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tickFormatter={rupiahShort}
              />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={110}
                fontSize={11}
              />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.25 }}
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => (
                      <div className="flex w-full flex-col gap-1">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs text-muted-foreground">Peringkat:</span>
                          <span className="text-xs font-semibold tabular-nums text-foreground">#{item.payload.rank}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs text-muted-foreground">Pendapatan:</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            Rp {Number(value).toLocaleString("id-ID")}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs text-muted-foreground">Porsi (5 Teratas):</span>
                          <span className="text-xs font-semibold tabular-nums text-primary">
                            {item.payload.percentage}%
                          </span>
                        </div>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 4, 4, 0]} maxBarSize={24}>
                {chartData.map((entry, index) => {
                  const isHovered = activeIndex === index
                  const isOtherHovered = activeIndex !== null && activeIndex !== index
                  return (
                    <Cell
                      key={`customer-cell-${index}`}
                      fill="var(--color-revenue)"
                      fillOpacity={isOtherHovered ? 0.3 : entry.rankOpacity}
                      stroke={isHovered ? "var(--primary)" : undefined}
                      strokeWidth={isHovered ? 1.5 : 0}
                      className="cursor-pointer transition-opacity duration-150"
                    />
                  )
                })}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

type StageData = { stage: string; count: number }

export function ProjectPipelineChart({ data }: { data: StageData[] }) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)
  const config = {
    count: { label: "Proyek", color: "var(--chart-1)" },
  } satisfies ChartConfig

  const hasData = data.some((d) => d.count > 0)
  const chartData = React.useMemo(() => {
    return data.map((d, i) => ({
      ...d,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }))
  }, [data])

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle id="pipeline-chart-title">Pipeline Pengerjaan</CardTitle>
        <CardDescription>Distribusi proyek aktif berdasarkan tahap pengerjaan</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p
            role="status"
            className="flex h-[240px] items-center justify-center text-sm text-muted-foreground"
          >
            Belum ada proyek aktif
          </p>
        ) : (
          <>
            <ChartContainer
              config={config}
              className="h-[240px] w-full"
              role="img"
              aria-labelledby="pipeline-chart-title"
              aria-describedby="pipeline-chart-desc"
            >
              <span id="pipeline-chart-desc" className="sr-only">
                Bar chart jumlah proyek aktif per tahap.
                {data
                  .map((d) => ` ${d.stage}: ${d.count}.`)
                  .join("")}
              </span>
              <BarChart
                data={chartData}
                margin={{ left: 4, right: 12, top: 8 }}
                onMouseMove={(state) => {
                  if (typeof state?.activeTooltipIndex === "number") {
                    setActiveIndex(state.activeTooltipIndex)
                  }
                }}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" opacity={0.6} />
                <XAxis dataKey="stage" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} fontSize={11} />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`pipeline-cell-${index}`}
                      fill={entry.fill}
                      opacity={activeIndex === null || activeIndex === index ? 1 : 0.45}
                      className="cursor-pointer transition-opacity duration-150"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <table className="sr-only">
              <caption>Pipeline Pengerjaan</caption>
              <thead>
                <tr>
                  <th scope="col">Tahap</th>
                  <th scope="col">Jumlah Proyek</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.stage}>
                    <th scope="row">{d.stage}</th>
                    <td>{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  )
}
