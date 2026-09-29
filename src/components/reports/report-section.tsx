import type { ReactNode } from "react"

/**
 * Formal report section — the fundamental building block for every accounting
 * report in YaraERP.  Replaces the modern card-based wrappers
 * (`bg-surface rounded-xl border shadow-sm`) with a clean print-ready layout:
 *
 *  - section heading (uppercase, bold, thin bottom border)
 *  - optional description / subtitle
 *  - table content, flush
 *
 * Designed to match the look of Accurate / Jurnal / Zahir printed statements
 * while still looking polished on screen.
 */
export function ReportSection({
  title,
  description,
  children,
  className,
  ...rest
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`report-section ${className ?? ""}`}
      {...rest}
    >
      {title ? (
        <div className="report-section-heading">
          <h2 className="report-section-title">{title}</h2>
          {description ? (
            <p className="report-section-desc">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="report-section-body">{children}</div>
    </div>
  )
}

/**
 * Flat KPI card for reports — no rounded corners, no shadow, no hover lift.
 * Use inside report pages to show summary numbers (totals, balances, margins).
 */
export function ReportKpiCard({
  label,
  value,
  valueClassName,
  icon,
}: {
  label: string
  value: string
  valueClassName?: string
  icon?: ReactNode
}) {
  return (
    <div className="report-kpi-card">
      {icon && <div className="report-kpi-icon">{icon}</div>}
      <div className="report-kpi-content">
        <p className="report-kpi-label">{label}</p>
        <p className={`report-kpi-value ${valueClassName ?? ""}`}>{value}</p>
      </div>
    </div>
  )
}
