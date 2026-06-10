import { getSystemSettings } from "@/lib/utils/settings"

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

  const companyName = settings.companyName || "Perusahaan"
  const addressParts = [
    settings.companyAddress,
    settings.companyPostalCode,
  ].filter(Boolean)
  const contactParts = [
    settings.companyPhone ? `Telp: ${settings.companyPhone}` : null,
    settings.companyEmail || null,
    settings.companyWebsite || null,
  ].filter(Boolean)

  return (
    <div className="report-letterhead">
      {/* Company identity band */}
      <div className="report-letterhead-company">
        {settings.companyLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.companyLogo}
            alt={companyName}
            className="report-letterhead-logo"
          />
        ) : null}
        <div className="report-letterhead-company-info">
          <div className="report-letterhead-company-name">{companyName}</div>
          {addressParts.length > 0 ? (
            <div className="report-letterhead-company-line">
              {addressParts.join(", ")}
            </div>
          ) : null}
          {contactParts.length > 0 ? (
            <div className="report-letterhead-company-line">
              {contactParts.join("  •  ")}
            </div>
          ) : null}
        </div>
      </div>

      {/* Statement title block */}
      <div className="report-letterhead-title-block">
        <h1 className="report-letterhead-title">{title}</h1>
        {subtitle ? (
          <div className="report-letterhead-subtitle">{subtitle}</div>
        ) : null}
        <div className="report-letterhead-period">{periodLabel}</div>
      </div>
    </div>
  )
}
