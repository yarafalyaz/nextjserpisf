import { ReactNode } from "react"

interface DetailCardProps {
  title?: string
  children: ReactNode
  className?: string
  columns?: 2 | 3 | 4
}

/**
 * Consistent card wrapper for detail page info sections.
 * Uses responsive grid layout.
 */
export function DetailCard({ title, children, className = "", columns = 3 }: DetailCardProps) {
  const colClass = {
    2: "grid-cols-[repeat(auto-fit,minmax(250px,1fr))]",
    3: "grid-cols-[repeat(auto-fit,minmax(200px,1fr))]",
    4: "grid-cols-[repeat(auto-fit,minmax(180px,1fr))]",
  }

  return (
    <div className={`bg-surface rounded-xl border border-default shadow-sm p-6 ${className}`}>
      {title && (
        <h2 className="text-base font-semibold text-foreground mb-4 pb-3 border-b border-default">{title}</h2>
      )}
      <div className={`grid ${colClass[columns]} gap-4`}>
        {children}
      </div>
    </div>
  )
}

interface DetailFieldProps {
  label: string
  value?: ReactNode
  mono?: boolean
  colSpan?: "full" | "2"
}

/**
 * Single field in a DetailCard grid.
 */
export function DetailField({ label, value, mono, colSpan }: DetailFieldProps) {
  const spanClass = colSpan === "full" ? "col-span-full" : colSpan === "2" ? "sm:col-span-2" : ""

  return (
    <div className={`flex flex-col gap-1 ${spanClass}`}>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-[0.9375rem] text-foreground font-medium ${mono ? "font-mono" : ""}`}>
        {value ?? "-"}
      </span>
    </div>
  )
}

interface DetailSectionProps {
  title: string
  children: ReactNode
  className?: string
}

/**
 * A titled section within a detail page (for grouping related info).
 */
export function DetailSection({ title, children, className = "" }: DetailSectionProps) {
  return (
    <div className={`bg-surface rounded-xl border border-default shadow-sm overflow-hidden ${className}`}>
      <div className="px-6 py-4 border-b border-default bg-surface-secondary/50">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  )
}
