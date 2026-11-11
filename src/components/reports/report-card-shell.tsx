import type { ReactNode } from "react"
import { BoxArchive } from "@/components/ui/fontawesome-icons"

/** Rangka kartu laporan bersama: section berlabel + kepala + isi/kosong. */
export function ReportCardShell({
  label,
  title,
  summary,
  isEmpty,
  emptyText,
  notice,
  contentClassName,
  children,
}: Readonly<{
  label: string
  title: string
  summary: ReactNode
  isEmpty: boolean
  emptyText: string
  notice?: string
  contentClassName?: string
  children: ReactNode
}>) {
  return (
    <section
      aria-label={label}
      className="bg-card rounded-lg border border-border shadow-2xs overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs font-mono tabular-nums text-muted-foreground">{summary}</p>
      </div>
      <div className={contentClassName ? `p-4 px-5 ${contentClassName}` : "p-4 px-5"}>
        {notice ? (
          <div className="mb-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground leading-relaxed text-pretty">{notice}</p>
          </div>
        ) : null}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
            <div className="flex size-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
              <BoxArchive className="size-4" aria-hidden="true" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{emptyText}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

/** Strip ringkasan label:jumlah verbatim builder (tanpa hitung ulang). */
export function ReportSummaryStrip({
  items,
}: Readonly<{ items: ReadonlyArray<readonly [string, number]> }>) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {items.map(([label, count]) => (
        <div key={label} className="flex items-baseline gap-2">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm font-semibold font-mono tabular-nums text-foreground">{count}</dd>
        </div>
      ))}
    </dl>
  )
}
