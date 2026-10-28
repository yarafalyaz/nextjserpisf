"use client"

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/shadcn/chart"
import { formatCompactNumber } from "@/lib/utils/format"
import { formatTrendValue, type TrendUnit } from "@/lib/reports/financial-charts"

export interface FinancialTrendChartProps {
  data: Array<Record<string, number | null | string>>
  series: { key: string; label: string; color: string }[]
  kind: "bar" | "line"
  unit: TrendUnit
  ariaLabel: string
}

/** Label sumbu yang ringkas (mis. "1,2 jt") supaya tidak menabrak grafik. */
function axisFormatter(value: number, unit: TrendUnit): string {
  if (unit === "percent") return `${value.toFixed(0)}%`
  if (unit === "ratio") return `${value.toFixed(1)}×`
  return formatCompactNumber(value)
}

/**
 * Grafik tren keuangan — satu komponen untuk keenam tampilan; yang berbeda hanya
 * serinya. Angkanya datang dari seri bulanan yang sudah dihitung halaman laporan,
 * jadi grafik tidak menghitung ulang apa pun (bila batangnya berbeda dengan tabel,
 * itu tanda ada dua sumber hitungan).
 *
 * Nilai `null` (rasio dengan penyebut nol) sengaja dibiarkan sebagai celah, bukan
 * dipaksa 0. recharts memuat bundel berat, jadi dipakai lewat
 * `components/lazy/financial-trend-chart.tsx`.
 */
export function FinancialTrendChart({ data, series, kind, unit, ariaLabel }: FinancialTrendChartProps) {
  const config = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  ) as ChartConfig

  const tooltip = (
    <ChartTooltip
      content={<ChartTooltipContent formatter={(value) => formatTrendValue(typeof value === "number" ? value : null, unit)} />}
    />
  )

  return (
    <ChartContainer config={config} className="h-[320px] w-full" role="img" aria-label={ariaLabel}>
      {kind === "bar" ? (
        <BarChart data={data} accessibilityLayer margin={{ left: 8, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} tick={{ fontSize: 11 }} />
          {tooltip}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      ) : (
        <LineChart data={data} accessibilityLayer margin={{ left: 8, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} tick={{ fontSize: 11 }} />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => axisFormatter(Number(value), unit)}
          />
          {tooltip}
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      )}
    </ChartContainer>
  )
}
