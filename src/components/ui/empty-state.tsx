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
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="text-muted-foreground/40 mb-4">{icon}</div>}
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
  const trendColor = trend === "up" ? "text-green-600" : trend === "down" ? "text-red-500" : "text-muted-foreground"

  return (
    <div className={`bg-surface rounded-xl border border-default shadow-sm p-5 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
          <span className="text-2xl font-bold text-foreground">{value}</span>
          {trendValue && (
            <span className={`text-xs font-medium ${trendColor}`}>{trendValue}</span>
          )}
        </div>
        {icon && <div className="text-muted-foreground/60">{icon}</div>}
      </div>
    </div>
  )
}
