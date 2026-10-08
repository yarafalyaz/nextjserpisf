import { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/shadcn/card"

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
      className={`${className}`}
      role="group"
      aria-label={`${label}: ${value}${trendValue ? `, tren ${trend === "up" ? "naik" : trend === "down" ? "turun" : "netral"} ${trendValue}` : ""}`}
    >
      <CardContent className="p-5">
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
      </CardContent>
    </Card>
  )
}
