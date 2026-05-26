"use client"

import { cn } from "@heroui/react"

interface DetailTableProps {
  children: React.ReactNode
  className?: string
}

export function DetailTable({ children, className }: DetailTableProps) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  )
}

export function DetailTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-default bg-surface-secondary/50">
        {children}
      </tr>
    </thead>
  )
}

export function DetailTableTh({
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
    <th
      colSpan={colSpan}
      className={cn(
        "py-2.5 px-3 text-xs font-semibold text-muted uppercase tracking-wide",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </th>
  )
}

export function DetailTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-default/50">{children}</tbody>
}

export function DetailTableRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <tr className={cn("hover:bg-surface-secondary/30 transition-colors", className)}>
      {children}
    </tr>
  )
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
    <td
      colSpan={colSpan}
      className={cn(
        "py-2.5 px-3 text-[0.8125rem] text-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </td>
  )
}

export function DetailTableFoot({ children }: { children: React.ReactNode }) {
  return <tfoot className="border-t border-default">{children}</tfoot>
}

export function DetailTableFootRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <tr className={cn("", className)}>{children}</tr>
}
