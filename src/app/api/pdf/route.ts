import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"
import { apiError } from "@/lib/api-response"
import { parseReportPeriod, splitReportSegments } from "@/lib/reports/report-period"
import { reportPdfFilename } from "@/lib/reports/report-export"
import { REPORTS, isReportPdfKey } from "@/lib/reports/report-registry"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import { buildStatementDocument, buildTableDocument } from "@/lib/pdf/documents/statement"
import { renderStatementPdfBytes, renderTablePdfBytes } from "@/lib/pdf/engine/render"

/**
 * PDF laporan, dirender di server oleh engine deklaratif.
 *
 * Mendukung URL path kanonik: `/api/pdf/<laporan>/<periode>[/<kunci>/<nilai>...]`
 * serta query string legacy `?laporan=...&periode=...` untuk kompatibilitas.
 * Unduh berkas: `/unduh/1` di path atau `?unduh=1` di query string.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function parsePdfRequestParams(url: URL): {
  report: string
  periodSlug: string | undefined
  search: Record<string, string>
  isDownload: boolean
} {
  const querySearch = Object.fromEntries(url.searchParams.entries())
  const rawPath = url.pathname.replace(/^\/api\/pdf\/?/, "")
  const pathParts = rawPath ? rawPath.split("/").filter(Boolean) : []

  if (pathParts.length > 0) {
    const report = pathParts[0]
    const restSegments = pathParts.slice(1)
    const { periodSlug, filters } = splitReportSegments(restSegments)
    const merged = { ...filters, ...querySearch }
    const isDownload =
      merged.unduh === "1" ||
      pathParts.includes("unduh") ||
      (pathParts.length >= 2 && pathParts[pathParts.length - 2] === "unduh" && pathParts[pathParts.length - 1] === "1")

    return {
      report,
      periodSlug: periodSlug ?? querySearch.periode,
      search: merged,
      isDownload: Boolean(isDownload),
    }
  }

  return {
    report: querySearch.laporan ?? "",
    periodSlug: querySearch.periode,
    search: querySearch,
    isDownload: querySearch.unduh === "1",
  }
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }
  const url = new URL(request.url)
  const { report, periodSlug, search, isDownload } = parsePdfRequestParams(url)
  if (!isReportPdfKey(report)) {
    return apiError("BAD_REQUEST", "Laporan tidak didukung")
  }

  // Laporan gaji/NPWP (data personalia sensitif) wajib view_payroll_reports SAJA.
  // view_reports generik TIDAK cukup (fail-closed): pemegang hanya-view_reports
  // kehilangan akses laporan gaji/PPh21 — role FINANCE whitelist sudah punya
  // view_payroll_reports, role kustom hanya-view_reports perlu grant ulang admin.
  // bukti-potong-pph BUKAN laporan payroll: loader-nya VendorBill pemasok
  // (loadWithholdingSummary), nol data karyawan — tetap gerbang laporan pajak
  // umum view_reports (vonis BOT 4 F-2026-10-21-034 + putusan Lead opsi (a)
  // atas sanggahan PR #316). Jangan masukkan kembali ke himpunan ini.
  // R6PA-03: rekap-borongan memuat upah PER TEKNISI (nama + amount baris
  // labor) — data upah personal, gerbang payroll sama, bukan view_reports.
  const PAYROLL_PDF_KEYS = new Set(["gaji-karyawan", "pph-21", "porsi-gaji", "rekap-borongan"])
  if (PAYROLL_PDF_KEYS.has(report)) {
    if (!(await hasPermission("view_payroll_reports"))) {
      return apiError("FORBIDDEN", "Akses ditolak")
    }
  } else if (!(await hasPermission("view_reports"))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  const definition = REPORTS[report]
  const printedBy = session.user.name ?? session.user.email ?? null
  const now = new Date()

  try {
    // Periode kanonik dipakai untuk nama berkas, sehingga unduhan berulang
    // memberi nama yang sama dan rapi.
    const period = parseReportPeriod(
      periodSlug ?? search.periode,
      definition.defaultPeriod?.(now) ?? { start: now, end: now },
    )

    // Scope gudang hanya untuk laporan stok; laporan lain tidak memicu
    // query scope ekstra. all -> undefined (tak ditegakkan), none -> [].
    const STOCK_PDF_KEYS = new Set([
      "mutasi-stok",
      "valuasi-stok",
      "kartu-stok",
      "penghitungan-stok",
      "transfer-terkirim",
      "stok-minimum",
      "umur-stok",
      "stok-tidak-bergerak",
      "ringkasan-stok",
      "rekonsiliasi-stok",
      // Putaran 69: rincian nilai per gudang — scope wajib dihitung.
      "selisih-persediaan",
    ])
    let warehouseScope: number[] | undefined
    if (STOCK_PDF_KEYS.has(report)) {
      const scope = await getWarehouseScope({
        id: session.user.id,
        roles: session.user.roles ?? [],
      })
      warehouseScope =
        scope.kind === "all" ? undefined : scope.kind === "assigned" ? scope.warehouseIds : []
    }

    const payload = await definition.load({ period, search, warehouseScope })

    const bytes =
      payload.kind === "statement"
        ? renderStatementPdfBytes(
            await buildStatementDocument({
              title: definition.title,
              subtitle: definition.subtitle,
              periodCaption: payload.periodCaption,
              table: payload.table,
              printedBy,
              origin: url.origin,
            }),
          )
        : renderTablePdfBytes(
            await buildTableDocument({
              title: definition.title,
              subtitle: definition.subtitle,
              periodCaption: payload.periodCaption,
              table: payload.table,
              landscape: payload.landscape,
              printedBy,
              origin: url.origin,
            }),
          )

    const filename = reportPdfFilename(report, period.slug)

    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("PDF laporan error:", error)
    return apiError("INTERNAL_ERROR", "Gagal membuat PDF laporan")
  }
}
