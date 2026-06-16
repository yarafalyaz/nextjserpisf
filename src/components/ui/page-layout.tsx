import { cn } from "@/lib/utils"

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-6", className)}>{children}</div>
}

export function PageHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-between flex-wrap gap-4", className)}>{children}</div>
}

export function PageTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h1 className={cn("text-2xl font-bold text-foreground m-0", className)}>{children}</h1>
}

export function PageSubtitle({ children, className }: { children: React.ReactNode; className?: string }) {
  // <p> is the correct semantic element for subtitle text. role="doc-subtitle"
  // is an ARIA role designed for "subtitle" purposes on top-level page headings;
  // assistive tech that understands it (e.g. NVDA, JAWS) announces the
  // relationship to the preceding h1, so screen-reader users hear e.g.
  // "heading: Laporan Keuangan, doc-subtitle: Periode 1 Jan – 31 Des 2026".
  return <p role="doc-subtitle" className={cn("text-[0.9375rem] text-muted-foreground mt-1", className)}>{children}</p>
}
