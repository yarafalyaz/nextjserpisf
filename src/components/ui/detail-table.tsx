import { cn } from "@/lib/utils"
import type { ReactNode, TableHTMLAttributes } from "react"

/* ── DetailTable (gaya dokumen laporan) ────────────────────────────────────
   Memakai kelas `.stmt` (lihat globals.css): hanya garis horizontal — tanpa
   kotak sel, tanpa latar abu pada header — angka rata kanan bertabular.
   Sengaja TIDAK memakai primitif shadcn `Table` supaya gaya kotak milik tabel
   aplikasi tidak melekat ke laporan, dan agar hasil cetak = tampilan layar.
   ──────────────────────────────────────────────────────────────────────── */

interface DetailTableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode
  className?: string
}

export function DetailTable({ children, className, ...rest }: DetailTableProps) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="stmt" {...rest}>
        {children}
      </table>
    </div>
  )
}

/**
 * Header tabel. `<tr>` disediakan di sini karena seluruh pemakaian (87 file)
 * menulis `<DetailTableTh>` langsung — `<th>` tanpa `<tr>` di dalam `<thead>`
 * adalah HTML tidak valid dan memicu hydration error React.
 */
export function DetailTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr>{children}</tr>
    </thead>
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
    <th
      scope={scope}
      colSpan={colSpan}
      className={cn(
        align === "right" && "num",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  )
}

export function DetailTableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>
}

export function DetailTableRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <tr className={className}>{children}</tr>
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
        align === "right" && "num",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  )
}

export function DetailTableFoot({ children }: { children: React.ReactNode }) {
  return <tfoot>{children}</tfoot>
}

export function DetailTableFootRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <tr className={className}>{children}</tr>
}
