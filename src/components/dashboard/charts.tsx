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

  const filteredData = React.useMemo(() => {
    if (data.length === 0) return []
    const referenceDate = new Date(data[data.length - 1].date)
    let days = 90
    if (timeRange === "30d") days = 30
    else if (timeRange === "7d") days = 7
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - days)
    return data.filter((item) => new Date(item.date) >= startDate)
  }, [data, timeRange])

  return (
    <Card className="h-full @container/chart">
      <CardHeader>
        <CardTitle id="revenue-chart-title">Tren Pendapatan</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/chart:block">
            Tagihan diterbitkan vs pembayaran lunas
          </span>
          <span className="@[540px]/chart:hidden">Tagihan vs lunas</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(v) => v && setTimeRange(v)}
            variant="outline"
            aria-label="Pilih rentang waktu"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/chart:flex"
          >
            <ToggleGroupItem value="90d">3 bulan</ToggleGroupItem>
            <ToggleGroupItem value="30d">30 hari</ToggleGroupItem>
            <ToggleGroupItem value="7d">7 hari</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 @[767px]/chart:hidden"
              size="sm"
              aria-label="Pilih rentang waktu"
            >
              <SelectValue placeholder="3 bulan terakhir" />
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
              Area chart membandingkan total tagihan diterbitkan dengan pembayaran
              lunas untuk rentang {timeRange === "7d" ? "7 hari" : timeRange === "30d" ? "30 hari" : "3 bulan"} terakhir. Total {filteredData.length} titik data.
            </span>
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
              <CartesianGrid vertical={false} />
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
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      new Date(value).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
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
              <Area
                dataKey="lunas"
                type="natural"
                fill="url(#fillLunas)"
                stroke="var(--color-lunas)"
                stackId="a"
              />
              <Area
                dataKey="tagihan"
                type="natural"
                fill="url(#fillTagihan)"
                stroke="var(--color-tagihan)"
                stackId="a"
              />
            </AreaChart>
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
  const config = {
    revenue: { label: "Pendapatan", color: "var(--chart-2)" },
  } satisfies ChartConfig

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Pelanggan Teratas</CardTitle>
        <CardDescription>5 pelanggan dengan pendapatan tertinggi</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 12, right: 16 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} tickFormatter={rupiahShort} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={120}
              fontSize={12}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent formatter={(value) => `Rp ${Number(value).toLocaleString("id-ID")}`} />
              }
            />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

type StageData = { stage: string; count: number }

export function ProjectPipelineChart({ data }: { data: StageData[] }) {
  const config = {
    count: { label: "Proyek", color: "var(--chart-1)" },
  } satisfies ChartConfig

  const hasData = data.some((d) => d.count > 0)

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
              <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="stage" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} fontSize={12} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
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
