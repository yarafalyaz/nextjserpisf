import { cn } from "@/lib/utils"
import type { ReactNode, TableHTMLAttributes } from "react"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter,
} from "@/components/ui/shadcn/table"

/* ── DetailTable (formal accounting style) ────────────────────────────────
   Matches the Accurate / Jurnal / Zahir printed-statement look.
   Built on shadcn/ui Table primitives.
   ──────────────────────────────────────────────────────────────────────── */

interface DetailTableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode
  className?: string
}

export function DetailTable({ children, className, ...rest }: DetailTableProps) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <Table {...rest}>{children}</Table>
    </div>
  )
}

export function DetailTableHead({ children }: { children: React.ReactNode }) {
  return (
    <TableHeader>
      <TableRow className="border-b border-default hover:bg-transparent">
        {children}
      </TableRow>
    </TableHeader>
  )
}

export function DetailTableTh({
  children,
  align = "left",
  className,
  colSpan,
  scope = "col",
}: {
  children: React.ReactNode
  align?: "left" | "right" | "center"
  className?: string
  colSpan?: number
  scope?: "col" | "row" | "colgroup" | "rowgroup"
}) {
  return (
    <TableHead
      scope={scope}
      colSpan={colSpan}
      className={cn(
        "py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </TableHead>
  )
}

export function DetailTableBody({ children }: { children: React.ReactNode }) {
  return <TableBody>{children}</TableBody>
}

export function DetailTableRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <TableRow className={cn("hover:bg-transparent", className)}>{children}</TableRow>
}

export function DetailTableTd({
  children,
  align = "left",
  className,
  colSpan,
}: {
  children: React.ReactNode
  align?: "left" | "right" | "center"
  className?: string
  colSpan?: number
}) {
  return (
    <TableCell
      colSpan={colSpan}
      className={cn(
        "py-2.5 px-3 text-[0.8125rem] text-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </TableCell>
  )
}

export function DetailTableFoot({ children }: { children: React.ReactNode }) {
  return <TableFooter className="border-t border-default">{children}</TableFooter>
}

export function DetailTableFootRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <TableRow className={cn("hover:bg-transparent", className)}>{children}</TableRow>
}
