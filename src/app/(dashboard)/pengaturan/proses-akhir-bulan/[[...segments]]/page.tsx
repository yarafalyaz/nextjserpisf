export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { AlertTriangle, CheckCircle2, Info } from "lucide-react"

import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/shadcn/card"
import { Badge } from "@/components/ui/shadcn/badge"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound, redirect } from "next/navigation"
import { loadPeriodClose } from "@/lib/settings/period-close-data"
import { parsePathFilterSegments } from "@/lib/utils/path-filters"
import { PeriodClosePanel } from "../_components/period-close-panel"
import { getYearEndClosingPreview } from "@/lib/reports/year-end-closing-data"
import { YearEndClosingPanel } from "../_components/year-end-closing-panel"

export const metadata: Metadata = { title: "Proses Akhir Bulan" }

export default async function PeriodClosePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermission("manage_settings")

  const params = await searchParams
  // Tautan lama `?periode=YYYY-MM` diarahkan ke bentuk path.
  if (params.periode) redirect(`/pengaturan/proses-akhir-bulan/periode/${params.periode}`)

  const { segments } = await routeParams
  const filters = parsePathFilterSegments(segments, { periode: /^\d{4}-\d{2}$/ })
  if (!filters) notFound()

  const { month, result } = await loadPeriodClose(filters.periode)
  const parsedYear = Number(params.tahun)
  const fiscalYear =
    /^\d{4}$/.test(params.tahun ?? "") && parsedYear >= 1900 && parsedYear <= 2200
      ? parsedYear
      : new Date().getFullYear()
  const yearEndPreview = await getYearEndClosingPreview(fiscalYear)
  const monthEnd = [
    month.end.getFullYear(),
    String(month.end.getMonth() + 1).padStart(2, "0"),
    String(month.end.getDate()).padStart(2, "0"),
  ].join("-")

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Proses Akhir Bulan" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Proses Akhir Bulan</h1>
        <p className="text-sm text-muted-foreground">
          Periksa kesiapan dan tutup periode akuntansi. Menutup periode memasang tanggal kunci —
          jurnal bertanggal pada atau sebelum tanggal itu tidak bisa lagi diposting atau diubah.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Periksa {month.label}</CardTitle>
          <CardDescription>{result.verdict}</CardDescription>
          <CardAction>
            {result.warningCount === 0 ? (
              <Badge variant="outline" className="gap-1 text-emerald-600">
                <CheckCircle2 className="size-3.5" /> Siap
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-amber-600">
                <AlertTriangle className="size-3.5" /> {result.warningCount} perlu diperiksa
              </Badge>
            )}
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          {result.checks.map((check) => (
            <div key={check.key} className="flex items-start gap-3 rounded-lg border bg-card p-4">
              {check.status === "ok" ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {check.title}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{check.count}</span>
                </p>
                <p className="text-xs text-muted-foreground">{check.description}</p>
                {check.status === "warn" ? (
                  <p className="mt-1 text-xs text-foreground">{check.guidance}</p>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kunci Periode</CardTitle>
          <CardDescription>
            {result.alreadyClosed
              ? "Bulan ini sudah tercakup kunci periode yang berlaku."
              : "Menutup periode tidak membatalkan dokumen apa pun — hanya mencegah posting bertanggal di dalamnya."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PeriodClosePanel
            monthKey={month.key}
            monthLabel={month.label}
            monthEnd={monthEnd}
            currentLockDate={result.currentLockDate}
            alreadyClosed={result.alreadyClosed}
          />
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Temuan di atas bersifat informatif, bukan penghalang: menutup periode tetap keputusan Anda.
            Buka kunci juga tersedia sebagai jalan koreksi dan tercatat di log aktivitas.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Penutup Tahun {fiscalYear}</CardTitle>
          <CardDescription>
            {yearEndPreview.alreadyClosed
              ? "Jurnal penutup tahun ini sudah terposting."
              : "Pratinjau jurnal penutup dari jurnal terposting; posting menutup akun pendapatan/beban ke laba ditahan."}
          </CardDescription>
          <CardAction>
            {yearEndPreview.alreadyClosed ? (
              <Badge variant="outline" className="gap-1 text-emerald-600">
                <CheckCircle2 className="size-3.5" /> Sudah ditutup
              </Badge>
            ) : yearEndPreview.balanced && yearEndPreview.retainedEarningsMapped ? (
              <Badge variant="outline" className="gap-1 text-emerald-600">
                <CheckCircle2 className="size-3.5" /> Siap posting
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-amber-600">
                <AlertTriangle className="size-3.5" /> Belum siap
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <YearEndClosingPanel
            preview={{ ...yearEndPreview, closingDate: yearEndPreview.closingDate.toISOString() }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
