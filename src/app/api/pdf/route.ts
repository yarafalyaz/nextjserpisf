import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"
import { apiError } from "@/lib/api-response"
import { parseReportPeriod } from "@/lib/reports/report-period"
import { reportPdfFilename, type ReportPdfKey } from "@/lib/reports/report-export"
import { REPORTS, isReportPdfKey } from "@/lib/reports/report-registry"
import { buildStatementDocument, buildTableDocument } from "@/lib/pdf/documents/statement"
import { renderStatementPdfBytes, renderTablePdfBytes } from "@/lib/pdf/engine/render"

/**
 * PDF laporan, dirender di server oleh engine deklaratif.
 *
 * Sebelumnya tombol "PDF" laporan membaca DOM halaman (`innerText` tabel) dan
 * tombol "Cetak" memanggil `window.print()` — cetakan karena itu bergantung pada
 * markup layar dan CSS cetak. Endpoint ini mengembalikan berkas PDF sungguhan yang
 * digambar dari DATA laporan (lihat `report-registry.ts`): dapat dipratinjau lalu
 * dicetak dari penampil PDF, atau diunduh (`?unduh=1`).
 *
 * Parameter:
 *   laporan=<kunci laporan>    (wajib; lihat REPORTS di report-registry.ts)
 *   periode=<slug>             (2026 | 2026-10 | 2026-10-12 | 2026-01-01_2026-10-12)
 *   + parameter tiap laporan (mis. induk/anak/nol/saldo/total, kolomPersen,
 *     termasukDilepas, pembanding)
 *   unduh=1                    (Content-Disposition: attachment)
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }
  if (!(await hasPermission("view_reports"))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  const url = new URL(request.url)
  const search = Object.fromEntries(url.searchParams.entries())
  const report = search.laporan ?? ""
  if (!isReportPdfKey(report)) {
    return apiError("BAD_REQUEST", "Laporan tidak didukung")
  }

  const definition = REPORTS[report]
  const printedBy = session.user.name ?? session.user.email ?? null
  const now = new Date()

  try {
    // Periode kanonik dipakai untuk nama berkas, sehingga unduhan berulang
    // memberi nama yang sama dan rapi.
    const period = parseReportPeriod(
      search.periode,
      definition.defaultPeriod?.(now) ?? { start: now, end: now },
    )

    const payload = await definition.load({ period, search })

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
        "Content-Disposition": `${search.unduh === "1" ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("PDF laporan error:", error)
    return apiError("INTERNAL_ERROR", "Gagal membuat PDF laporan")
  }
}
