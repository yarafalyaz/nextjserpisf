import { prisma } from "@/lib/db/prisma"
import { parseReportFilters } from "@/lib/reports/report-href"
import {
  reportPeriodFromRoute,
  reportYearToDatePeriod,
} from "@/lib/reports/report-period"
import type { ReportSelectFilter } from "@/components/reports/report-period-filter"

/**
 * Pilihan pelanggan aktif untuk filter laporan (slug, fallback id).
 * Dipakai halaman Statement Pelanggan + Terkirim Belum Terfaktur —
 * query/pemilihan identik, jangan salin per halaman.
 */
export interface ReportCustomerOption {
  id: number
  code: string | null
  name: string
  slug: string | null
}

export async function loadReportCustomerSelection(key: string | null) {
  const customers: ReportCustomerOption[] = await prisma.customer.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, slug: true },
  })
  const selected = key
    ? customers.find((c) => c.slug === key) ?? customers.find((c) => String(c.id) === key) ?? null
    : null
  return { customers, selected }
}

/** Kunci pelanggan dari segmen path (pelanggan/<slug|id>) atau query lama customerId. */
export function reportCustomerKey(
  segments: string[],
  search: Record<string, string | undefined>,
): string | null {
  return parseReportFilters(segments.slice(1)).pelanggan ?? search.customerId ?? null
}

/** Periode tahun-berjalan + pilihan pelanggan dari rute laporan. */
export async function loadReportPeriodCustomer(
  routeParams: Promise<{ segments?: string[] }>,
  searchParams: Promise<Record<string, string | undefined>>,
) {
  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const key = reportCustomerKey(segments, search)
  const period = await reportPeriodFromRoute(routeParams, searchParams, reportYearToDatePeriod)
  const { customers, selected } = await loadReportCustomerSelection(key)
  return { period, customers, selected }
}

export function reportCustomerSelect({
  customers,
  selected,
  placeholder,
  required,
}: {
  customers: ReportCustomerOption[]
  selected: ReportCustomerOption | null
  placeholder: string
  required?: boolean
}): ReportSelectFilter {
  return {
    param: "pelanggan",
    label: "Pelanggan",
    placeholder,
    ...(required ? { required } : {}),
    value: selected ? (selected.slug ?? String(selected.id)) : "",
    options: customers.map((c) => ({
      value: c.slug ?? String(c.id),
      label: `${c.code ? `${c.code} — ` : ""}${c.name}`,
    })),
  }
}
