import { ReactNode } from "react"

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

/**
 * Empty state placeholder for lists/tables with no data.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
// Visual only — non-clickable container with semantic grouping for AT.
    <div
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
      role="status"
    >
      {icon && <div className="text-muted-foreground/40 mb-4" aria-hidden="true">{icon}</div>}
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  trend?: "up" | "down" | "neutral"
  trendValue?: string
  className?: string
}

/**
 * Stat card for dashboard/summary sections.
 */
export function StatCard({ label, value, icon, trend, trendValue, className = "" }: StatCardProps) {
  const trendColor = trend === "up" ? "text-emerald-600 dark:text-emerald-400" : trend === "down" ? "text-red-500 dark:text-red-400" : "text-muted-foreground"

  return (
    <div
      className={`bg-surface rounded-xl border border-default shadow-sm p-5 ${className}`}
      role="group"
      aria-label={`${label}: ${value}${trendValue ? `, tren ${trend === "up" ? "naik" : trend === "down" ? "turun" : "netral"} ${trendValue}` : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide" aria-hidden="true">{label}</span>
          <span className="text-2xl font-bold text-foreground tabular-nums" aria-hidden="true">{value}</span>
          {trendValue && (
            <span className={`text-xs font-medium ${trendColor}`} aria-hidden="true">
              {trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}
              {trendValue}
            </span>
          )}
        </div>
        {icon && <div className="text-muted-foreground/60" aria-hidden="true">{icon}</div>}
      </div>
    </div>
  )
}
