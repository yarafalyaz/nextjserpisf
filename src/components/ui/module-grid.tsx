import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface ModuleItem {
  label: string
  href: string
  icon: LucideIcon
  desc: string
}

export interface ModuleGridProps {
  items: ModuleItem[]
  /**
   * Accessible label for the landmark wrapping the module grid.
   * Defaults to a generic "Modul" label; pages should pass a
   * module-specific value like "Modul Keuangan" for screen readers.
   */
  ariaLabel: string
  /** Optional id used to associate the grid landmark with its heading. */
  headingId?: string
  /** Extra classes for the inner <ul> grid. */
  className?: string
  /** Optional content rendered above the grid (e.g. a heading). */
  header?: ReactNode
}

const cardClassName =
  "group flex items-center gap-4 rounded-xl border border-default bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

/**
 * ModuleGrid — a semantic, accessible grid of module landing cards.
 *
 * Renders as a `<nav>` landmark containing a `<ul>` of `<li>` items.
 * Each card is a focusable `<Link>` whose accessible name is a
 * composite of "<label> — <description>" so screen-reader users
 * hear what the destination is *for*, not just the module name.
 *
 * The leading icon is marked aria-hidden because the visible text
 * already names the destination.
 *
 * Server Component — no client interactivity, no hooks.
 */
export function ModuleGrid({
  items,
  ariaLabel,
  headingId,
  className,
  header,
}: ModuleGridProps) {
  return (
    <nav aria-label={ariaLabel} className="flex flex-col gap-4">
      {header}
      <ul
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
          className
        )}
        {...(headingId ? { "aria-labelledby": headingId } : {})}
      >
        {items.map((item) => (
          <li key={item.href}>
            <ModuleCard {...item} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

function ModuleCard({ label, href, icon: Icon, desc }: ModuleItem) {
  return (
    <Link
      href={href}
      aria-label={`${label} — ${desc}`}
      className={cardClassName}
    >
      <div
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"
      >
        <Icon size={20} className="text-primary" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {label}
        </p>
        <p className="truncate text-xs text-muted-foreground">{desc}</p>
      </div>
    </Link>
  )
}
