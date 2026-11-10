import { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/shadcn/card"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

/**
 * Shared empty state — replaces scattered inline "Belum ada …" text.
 * API mirrors neighbouring shared components (PageHeader: title/description/
 * actions, StatCard: icon/className). Pure presentational, safe as RSC.
 */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-16 text-center", className)}>
      {icon && (
        <div className="text-muted-foreground/60" aria-hidden="true">{icon}</div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
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
 * Stat card for dashboard/summary sections — built on shadcn/ui Card.
 */
export function StatCard({ label, value, icon, trend, trendValue, className = "" }: StatCardProps) {
  const trendColor = trend === "up" ? "text-emerald-600 dark:text-emerald-400" : trend === "down" ? "text-red-500 dark:text-red-400" : "text-muted-foreground"

  return (
    <Card
      className={cn("py-4 gap-2", className)}
      role="group"
      aria-label={`${label}: ${value}${trendValue ? `, tren ${trend === "up" ? "naik" : trend === "down" ? "turun" : "netral"} ${trendValue}` : ""}`}
    >
      <CardContent className="px-4 py-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider" aria-hidden="true">{label}</span>
            <span className="text-xl font-semibold tracking-tight text-foreground tabular-nums sm:text-2xl" aria-hidden="true">{value}</span>
            {trendValue && (
              <span className={`text-xs font-medium tabular-nums ${trendColor}`} aria-hidden="true">
                {trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}
                {trendValue}
              </span>
            )}
          </div>
          {icon && (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground" aria-hidden="true">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
