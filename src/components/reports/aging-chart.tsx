"use client"

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/shadcn/chart"
import { formatCurrency } from "@/lib/utils/format"

export interface AgingChartDatum {
  /** Kategori umur, mis. "31–60 Hari". */
  label: string
  total: number
  count: number
}

/**
 * Grafik batang umur piutang/utang — satu batang per kategori umur.
 *
 * Angkanya datang dari ringkasan umur yang sudah dihitung halaman laporan, jadi
 * grafik ini tidak menjumlahkan apa pun sendiri: kalau batangnya berbeda dengan
 * tabel di atasnya, itu berarti ada dua sumber hitungan (dan memang pernah
 * terjadi di laporan lain). Menampilkan grafik, bukan mengarang angka.
 *
 * Modul ini memuat recharts, jadi sengaja di-lazy-load lewat
 * `components/lazy/aging-chart.tsx`.
 */
export function AgingChart({
  data,
  label,
  ariaLabel,
}: {
  data: AgingChartDatum[]
  label: string
  ariaLabel: string
}) {
  const config = {
    total: { label, color: "var(--chart-2)" },
  } satisfies ChartConfig

  return (
    <ChartContainer config={config} className="h-[280px] w-full" role="img" aria-label={ariaLabel}>
      <BarChart data={data} accessibilityLayer margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatCurrency(Number(value))}
              labelFormatter={(_, payload) => {
                const datum = payload?.[0]?.payload as AgingChartDatum | undefined
                return datum ? `${datum.label} · ${datum.count} dokumen` : String(_)
              }}
            />
          }
        />
        <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
