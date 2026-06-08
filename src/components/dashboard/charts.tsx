"use client"

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
import { statusLabel } from "@/lib/utils/status-labels"

type RevenueData = { month: string; revenue: number }
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

function formatMonth(ym: string) {
  // "2026-06" -> "Jun"
  const [y, m] = ym.split("-")
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString("id-ID", { month: "short" })
}

function rupiahShort(v: number) {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}M`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}jt`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`
  return String(v)
}

export function RevenueChart({ data }: { data: RevenueData[] }) {
  const chartData = data.map((d) => ({ ...d, label: formatMonth(d.month) }))
  const config = {
    revenue: { label: "Pendapatan", color: "var(--chart-1)" },
  } satisfies ChartConfig

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Tren Pendapatan</CardTitle>
        <CardDescription>6 bulan terakhir</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[280px] w-full">
          <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
            <defs>
              <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} width={42} fontSize={12} tickFormatter={rupiahShort} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value) => `Rp ${Number(value).toLocaleString("id-ID")}`}
                />
              }
            />
            <Area
              dataKey="revenue"
              type="monotone"
              fill="url(#fillRevenue)"
              stroke="var(--color-revenue)"
              strokeWidth={2.5}
            />
          </AreaChart>
        </ChartContainer>
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
        <CardTitle>Faktur per Status</CardTitle>
        <CardDescription>Distribusi seluruh faktur</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="mx-auto h-[280px] w-full">
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
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
          {chartData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: item.fill }} />
              <span className="text-xs text-muted-foreground">
                {item.label} ({item.value})
              </span>
            </div>
          ))}
        </div>
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
        <CardTitle>Pipeline Pengerjaan</CardTitle>
        <CardDescription>Jumlah proyek aktif per tahap saat ini</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            Belum ada proyek aktif
          </p>
        ) : (
          <ChartContainer config={config} className="h-[280px] w-full">
            <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="stage" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} fontSize={12} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
