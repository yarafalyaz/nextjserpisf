import { getSystemSettings } from "@/lib/utils/settings"
import { companyAddressLines } from "@/lib/utils/company-address"
import { formatDate } from "@/lib/utils/format"
import { auth } from "@/lib/auth/auth"

/**
 * Professional financial-statement letterhead, mirroring how Accurate / Jurnal /
 * Zahir head their reports: company identity block, the statement title, and the
 * reporting period / as-of date. Rendered as a server component so company
 * settings (name, address, logo) are fetched once per request via the cached
 * getSystemSettings().
 *
 * Visible both on screen (as a formal report header) and in print. The print
 * stylesheet (.report-letterhead rules in globals.css) takes over for paper:
 * black-on-white, centered, bordered, and repeated context where relevant.
 */
export async function ReportLetterhead({
  title,
  subtitle,
  periodLabel,
}: {
  /** Statement name, e.g. "NERACA" or "LAPORAN LABA RUGI". */
  title: string
  /** Optional second line under the title (e.g. report variant). */
  subtitle?: string
  /** Period or as-of text, e.g. "Per 31 Desember 2026" or "Periode 1 Jan – 31 Des 2026". */
  periodLabel: string
}) {
  const settings = await getSystemSettings()
  // Footer cetak "Dicetak oleh" — sesi opsional supaya kop tetap bisa dirender
  // di konteks tanpa sesi (mis. pratinjau) tanpa melempar error.
  const printedBy = await auth()
    .then((session) => session?.user?.name ?? session?.user?.email ?? null)
    .catch(() => null)
  const printedAt = formatDate(new Date(), { format: "numeric", includeTime: true })

  const companyName = settings.companyName || "Perusahaan"
  const addressLines = companyAddressLines(settings)
  const contactParts = [
    settings.companyPhone ? `Telp: ${settings.companyPhone}` : null,
    settings.companyEmail || null,
    settings.companyWebsite || null,
  ].filter(Boolean)

  return (
    <div className="report-letterhead">
      {/* Company identity block — centered, like a printed statement. */}
      <div className="doc-head">
        {settings.companyLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.companyLogo}
            alt={companyName}
            className="doc-logo"
          />
        ) : null}
        <div className="doc-company">{companyName}</div>
        {addressLines.map((line) => (
          <div className="doc-lines" key={line}>
            {line}
          </div>
        ))}
        {contactParts.length > 0 ? (
          <div className="doc-lines">{contactParts.join("  •  ")}</div>
        ) : null}
      </div>

      <hr className="doc-rule" />

      {/* Statement title block */}
      <div className="doc-head">
        <h1 className="doc-title">{title}</h1>
        {subtitle ? <div className="doc-subtitle">{subtitle}</div> : null}
      </div>

      <div className="doc-meta">
        <span className="doc-period">{periodLabel}</span>
        <span>Mata Uang: Indonesian Rupiah</span>
      </div>

      {/* Hidden div for PDF export to pick up the period label */}
      <div data-report-period={periodLabel} hidden />

      {/* Berulang di setiap halaman cetak (lihat .doc-print-footer di globals.css) */}
      <div className="doc-print-footer">
        Dicetak: {printedAt}
        {printedBy && printedBy !== companyName ? ` oleh ${printedBy}` : ""}
      </div>
    </div>
  )
}
