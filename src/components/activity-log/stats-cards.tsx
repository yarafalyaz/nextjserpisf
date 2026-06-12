interface Stat {
  label: string
  value: number | string
  hint?: string
  tone?: "default" | "warn" | "good" | "bad"
}

const toneMap: Record<NonNullable<Stat["tone"]>, string> = {
  default: "border-border bg-card",
  good: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
  warn: "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
  bad: "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30",
}

export function StatsCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`rounded-lg border p-3 ${toneMap[s.tone ?? "default"]}`}
        >
          <div className="text-xs text-muted-foreground">{s.label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{s.value}</div>
          {s.hint ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{s.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
