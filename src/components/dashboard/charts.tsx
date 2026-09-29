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
  CardAction,
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

    const refDate = data.length > 0
      ? new Date(data[data.length - 1].date)
      : new Date()
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
          <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.4} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            fontSize={12}
            tickFormatter={formatDayLabel}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={42}
            fontSize={12}
            tickFormatter={rupiahShort}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
            content={
              <ChartTooltipContent
                labelFormatter={(value) =>
                  new Date(value).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "Asia/Jakarta",
                  })
                }
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
          {showTagihan && (
            <Line
              dataKey="tagihan"
              type="monotone"
              stroke="var(--color-tagihan)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          )}
          {showLunas && (
            <Line
              dataKey="lunas"
              type="monotone"
              stroke="var(--color-lunas)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          )}
        </LineChart>
      )
    }

    if (chartType === "bar") {
      return (
        <BarChart data={filteredData}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.4} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            fontSize={12}
            tickFormatter={formatDayLabel}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={42}
            fontSize={12}
            tickFormatter={rupiahShort}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.15 }}
            content={
              <ChartTooltipContent
                labelFormatter={(value) =>
                  new Date(value).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "Asia/Jakarta",
                  })
                }
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
          {showTagihan && (
            <Bar
              dataKey="tagihan"
              fill="var(--color-tagihan)"
              radius={[4, 4, 0, 0]}
            />
          )}
          {showLunas && (
            <Bar
              dataKey="lunas"
              fill="var(--color-lunas)"
              radius={[4, 4, 0, 0]}
            />
          )}
        </BarChart>
      )
    }

    return (
      <AreaChart data={filteredData}>
        <defs>
          <linearGradient id="fillTagihan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-tagihan)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-tagihan)" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="fillLunas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-lunas)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-lunas)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.4} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          fontSize={12}
          tickFormatter={formatDayLabel}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={42}
          fontSize={12}
          tickFormatter={rupiahShort}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                new Date(value).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "Asia/Jakarta",
                })
              }
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
        {showTagihan && (
          <Area
            dataKey="tagihan"
            type="monotone"
            fill="url(#fillTagihan)"
            stroke="var(--color-tagihan)"
            activeDot={{ r: 6, strokeWidth: 2 }}
          />
        )}
        {showLunas && (
          <Area
            dataKey="lunas"
            type="monotone"
            fill="url(#fillLunas)"
            stroke="var(--color-lunas)"
            activeDot={{ r: 6, strokeWidth: 2 }}
          />
        )}
      </AreaChart>
    )
  }

  return (
    <Card className="h-full @container/chart">
      <CardHeader>
        <div className="flex flex-col gap-2 @[540px]/chart:flex-row @[540px]/chart:items-center @[540px]/chart:justify-between">
          <div>
            <CardTitle id="revenue-chart-title">Tren Pendapatan</CardTitle>
            <CardDescription className="mt-1">
              <span className="hidden @[540px]/chart:block">
                Tagihan diterbitkan vs pembayaran lunas
              </span>
              <span className="@[540px]/chart:hidden">Tagihan vs lunas</span>
            </CardDescription>
          </div>
          <CardAction className="flex items-center gap-2 flex-wrap">
            {/* Chart type selector */}
            <ToggleGroup
              type="single"
              value={chartType}
              onValueChange={(v) => v && setChartType(v as "area" | "line" | "bar")}
              variant="outline"
              size="sm"
              aria-label="Tipe Grafik"
              className="*:data-[slot=toggle-group-item]:!px-2"
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
              className="hidden *:data-[slot=toggle-group-item]:!px-3 @[767px]/chart:flex"
            >
              <ToggleGroupItem value="90d">3 bulan</ToggleGroupItem>
              <ToggleGroupItem value="30d">30 hari</ToggleGroupItem>
              <ToggleGroupItem value="7d">7 hari</ToggleGroupItem>
            </ToggleGroup>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger
                className="flex w-32 @[767px]/chart:hidden"
                size="sm"
                aria-label="Pilih rentang waktu"
              >
                <SelectValue placeholder="3 bulan" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="90d" className="rounded-lg">
                  3 bulan terakhir
                </SelectItem>
                <SelectItem value="30d" className="rounded-lg">
                  30 hari terakhir
                </SelectItem>
                <SelectItem value="7d" className="rounded-lg">
                  7 hari terakhir
                </SelectItem>
              </SelectContent>
            </Select>
          </CardAction>
        </div>

        {/* Interactive Filter Pills / Cards */}
        {filteredData.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t text-xs">
            <button
              type="button"
              onClick={() => setActiveSeries("all")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                activeSeries === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Semua Data
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveSeries((prev) => (prev === "lunas" ? "all" : "lunas"))
              }
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                showLunas && activeSeries !== "all"
                  ? "bg-[var(--chart-2)] text-white shadow-sm"
                  : activeSeries === "all"
                  ? "bg-[var(--chart-2)]/15 text-[var(--chart-2)] border border-[var(--chart-2)]/30"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[var(--chart-2)]" />
              Lunas: <span className="font-semibold">Rp {rupiahShort(totals.lunas)}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveSeries((prev) => (prev === "tagihan" ? "all" : "tagihan"))
              }
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                showTagihan && activeSeries !== "all"
                  ? "bg-[var(--chart-1)] text-white shadow-sm"
                  : activeSeries === "all"
                  ? "bg-[var(--chart-1)]/15 text-[var(--chart-1)] border border-[var(--chart-1)]/30"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[var(--chart-1)]" />
              Tagihan: <span className="font-semibold">Rp {rupiahShort(totals.tagihan)}</span>
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {filteredData.length === 0 ? (
          <p
            role="status"
            className="flex h-[280px] items-center justify-center text-sm text-muted-foreground"
          >
            Belum ada data pendapatan
          </p>
        ) : (
          <ChartContainer
            config={revenueConfig}
            className="aspect-auto h-[280px] w-full"
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

export function SalesStatusChart({ data }: { data: StatusData[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const chartData = data.map((d, i) => ({
    ...d,
    label: statusLabel(d.name),
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }))
  const config: ChartConfig = Object.fromEntries(
    chartData.map((d, i) => [d.name, { label: d.label, color: PIE_COLORS[i % PIE_COLORS.length] }])
  )

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle id="sales-status-chart-title">Faktur per Status</CardTitle>
        <CardDescription>Distribusi seluruh faktur</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p
            role="status"
            className="flex h-[280px] items-center justify-center text-sm text-muted-foreground"
          >
            Belum ada data faktur
          </p>
        ) : (
          <>
            <ChartContainer
              config={config}
              className="mx-auto h-[280px] w-full"
              role="img"
              aria-labelledby="sales-status-chart-title"
              aria-describedby="sales-status-chart-desc"
            >
              <span id="sales-status-chart-desc" className="sr-only">
                Pie chart distribusi {total} faktur berdasarkan status.
                {chartData
                  .map((d) => ` ${d.label}: ${d.value} (${Math.round((d.value / total) * 100)}%).`)
                  .join("")}
              </span>
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={62} outerRadius={100} paddingAngle={2} strokeWidth={2}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                            <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold">
                              {total}
                            </tspan>
                            <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 20} className="fill-muted-foreground text-xs">
                              Faktur
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
                    <td>{Math.round((item.value / total) * 100)}%</td>
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
      // Calculate opacity scale based on rank (1st rank = 1, 2nd = 0.85, 3rd = 0.7, etc)
      const rankOpacity = Math.max(0.4, 1 - index * 0.15)
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Pelanggan Teratas</CardTitle>
            <CardDescription className="mt-1">
              5 pelanggan dengan pendapatan tertinggi
            </CardDescription>
          </div>
          {totalRevenue > 0 && (
            <div className="text-right">
              <span className="text-xs text-muted-foreground block">Total 5 Teratas</span>
              <span className="text-sm font-semibold text-foreground">
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
            className="flex h-[280px] items-center justify-center text-sm text-muted-foreground"
          >
            Belum ada data pelanggan
          </p>
        ) : (
          <ChartContainer config={config} className="h-[280px] w-full">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
              onMouseMove={(state) => {
                if (typeof state?.activeTooltipIndex === "number") {
                  setActiveIndex(state.activeTooltipIndex)
                }
              }}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.4} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                tickFormatter={rupiahShort}
              />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={110}
                fontSize={12}
              />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.25 }}
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => (
                      <div className="flex flex-col gap-1 w-full">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground text-xs">Peringkat:</span>
                          <span className="font-semibold text-xs text-foreground">#{item.payload.rank}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground text-xs">Pendapatan:</span>
                          <span className="font-mono font-medium text-foreground">
                            Rp {Number(value).toLocaleString("id-ID")}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground text-xs">Porsi (5 Teratas):</span>
                          <span className="font-semibold text-xs text-primary">
                            {item.payload.percentage}%
                          </span>
                        </div>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 6, 6, 0]} maxBarSize={28}>
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
                      className="transition-all duration-200 cursor-pointer"
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
      <CardHeader>
        <CardTitle id="pipeline-chart-title">Pipeline Pengerjaan</CardTitle>
        <CardDescription>Jumlah proyek aktif per tahap saat ini</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p
            role="status"
            className="flex h-[280px] items-center justify-center text-sm text-muted-foreground"
          >
            Belum ada proyek aktif
          </p>
        ) : (
          <>
            <ChartContainer
              config={config}
              className="h-[280px] w-full"
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
                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="stage" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} fontSize={12} />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`pipeline-cell-${index}`}
                      fill={entry.fill}
                      opacity={activeIndex === null || activeIndex === index ? 1 : 0.45}
                      className="transition-all duration-200 cursor-pointer"
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
