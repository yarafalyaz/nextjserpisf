import { getSystemSettings } from "@/lib/utils/settings"
import { companyAddressLines } from "@/lib/utils/company-address"
import { formatDate } from "@/lib/utils/format"

/**
 * Lembar laporan (dokumen) — kop tengah + judul + periode + isi + kaki cetak.
 *
 * On screen it is a white A4-width sheet; the print stylesheet strips the
 * border/shadow so the paper output is the same document, not a screenshot of
 * an app page. Used by the accounting statements (Laba Rugi, Neraca, …).
 */
export async function ReportSheet({
  title,
  subtitle,
  periodLabel,
  /** Teks kiri pada baris periode (default: periodLabel). */
  periodCaption,
  /** Info kanan, mis. "Mata Uang: Indonesian Rupiah". */
  metaRight = "Mata Uang: Indonesian Rupiah",
  printedBy,
  signatures,
  wide = false,
  children,
}: {
  title: string
  subtitle?: string
  periodLabel: string
  periodCaption?: string
  metaRight?: string
  printedBy?: string | null
  signatures?: string[]
  wide?: boolean
  children: React.ReactNode
}) {
  const settings = await getSystemSettings()

  const companyName = settings.companyName || "Perusahaan"
  const addressLines = companyAddressLines(settings)
  const contactParts = [
    settings.companyPhone ? `Telp: ${settings.companyPhone}` : null,
    settings.companyEmail || null,
    settings.companyWebsite || null,
  ].filter(Boolean)

  const printedAt = formatDate(new Date(), { format: "numeric", includeTime: true })

  return (
    <div className={`report-sheet${wide ? " report-sheet-wide" : ""}`}>
      <div className="doc-head">
        {settings.companyLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.companyLogo} alt={companyName} className="doc-logo" />
        ) : null}
        <div className="doc-company">{companyName}</div>
        {addressLines.map((line) => (
          <div className="doc-lines" key={line}>
            {line}
          </div>
        ))}
        {contactParts.length > 0 ? <div className="doc-lines">{contactParts.join("  •  ")}</div> : null}
      </div>

      <hr className="doc-rule" />

      <div className="doc-head">
        <h1 className="doc-title">{title}</h1>
        {subtitle ? <div className="doc-subtitle">{subtitle}</div> : null}
      </div>

      <div className="doc-meta">
        <span className="doc-period">{periodCaption ?? periodLabel}</span>
        <span>{metaRight}</span>
      </div>

      <div data-report-period={periodLabel} hidden />

      {children}

      <div className="doc-foot">
        <span>
          Dicetak: {printedAt}
          {printedBy ? ` oleh ${printedBy}` : ""}
        </span>
        <span>{companyName}</span>
      </div>

      {signatures && signatures.length > 0 ? (
        <div className="doc-foot-sig">
          {signatures.map((role) => (
            <div key={role}>
              <div>{role}</div>
              <div className="sig-line" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
