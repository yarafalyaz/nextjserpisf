import type { ReactNode } from "react"

/** Rangka kartu laporan bersama: section berlabel + kepala + isi/kosong. */
export function ReportCardShell({
  label,
  title,
  summary,
  isEmpty,
  emptyText,
  notice,
  children,
}: Readonly<{
  label: string
  title: string
  summary: ReactNode
  isEmpty: boolean
  emptyText: string
  notice?: string
  children: ReactNode
}>) {
  return (
    <section
      aria-label={label}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{summary}</p>
      </div>
      <div className="p-4 px-5">
        {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
        {isEmpty ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
