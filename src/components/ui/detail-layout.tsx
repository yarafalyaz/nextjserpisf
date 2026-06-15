import { cn } from "@/lib/utils"

export function DetailCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-surface rounded-xl border border-default shadow-sm p-6", className)}>{children}</div>
}

export function DetailGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4", className)}>{children}</dl>
}

export function DetailItem({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="text-[0.9375rem] text-foreground font-medium m-0">{value || "-"}</dd>
    </div>
  )
}
