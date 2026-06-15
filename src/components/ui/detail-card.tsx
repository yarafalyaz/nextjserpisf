import { ReactNode, useId } from "react"

interface DetailCardProps {
  title?: string
  children: ReactNode
  className?: string
  columns?: 2 | 3 | 4
}

/**
 * Consistent card wrapper for detail page info sections.
 * Uses responsive grid layout. Renders the inner grid as a semantic
 * description list (<dl>) so assistive tech announces key/value pairs as a
 * proper term/description list rather than a generic div grid.
 */
export function DetailCard({ title, children, className = "", columns = 3 }: DetailCardProps) {
  const colClass = {
    2: "grid-cols-[repeat(auto-fit,minmax(250px,1fr))]",
    3: "grid-cols-[repeat(auto-fit,minmax(200px,1fr))]",
    4: "grid-cols-[repeat(auto-fit,minmax(180px,1fr))]",
  }

  const headerId = useId()
  const labelledBy = title ? headerId : undefined

  return (
    <section
      aria-labelledby={labelledBy}
      className={`bg-surface rounded-xl border border-default shadow-sm p-6 ${className}`}
    >
      {title && (
        <h2
          id={headerId}
          className="text-base font-semibold text-foreground mb-4 pb-3 border-b border-default"
        >
          {title}
        </h2>
      )}
      <dl className={`grid ${colClass[columns]} gap-4`}>
        {children}
      </dl>
    </section>
  )
}

interface DetailFieldProps {
  label: string
  value?: ReactNode
  mono?: boolean
  colSpan?: "full" | "2"
}

/**
 * Single field in a DetailCard grid. Renders as a <dt>/<dd> pair (wrapped in a
 * layout div) so the parent's <dl> stays valid while keeping responsive
 * col-span support.
 */
export function DetailField({ label, value, mono, colSpan }: DetailFieldProps) {
  const spanClass = colSpan === "full" ? "col-span-full" : colSpan === "2" ? "sm:col-span-2" : ""

  return (
    <div className={`flex flex-col gap-1 ${spanClass}`}>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className={`text-[0.9375rem] text-foreground font-medium m-0 ${mono ? "font-mono" : ""}`}>
        {value ?? "-"}
      </dd>
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
 * Uses semantic <section> with aria-labelledby for landmark navigation.
 */
export function DetailSection({ title, children, className = "" }: DetailSectionProps) {
  const headerId = useId()
  return (
    <section
      aria-labelledby={headerId}
      className={`bg-surface rounded-xl border border-default shadow-sm overflow-hidden ${className}`}
    >
      <div className="px-6 py-4 border-b border-default bg-surface-secondary/50">
        <h2 id={headerId} className="text-sm font-semibold text-foreground uppercase tracking-wide">
          {title}
        </h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
  )
}
