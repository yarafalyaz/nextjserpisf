import Link from "next/link"
import { ChevronRight, type LucideIcon } from "@/components/ui/fontawesome-icons"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface ModuleItem {
  label: string
  href: string
  icon: LucideIcon
  desc: string
  /** Permission required to view this module card. Omit to always show. */
  permission?: string
  /** Alternatif `permission`: kartu tampil bila pengguna punya salah satu izin ini. */
  permissions?: string[]
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
  /** Permissions held by current session user. If provided, filters cards by item.permission. */
  userPermissions?: string[]
  /** True for super_admin to bypass permission filtering on cards. */
  isSuperAdmin?: boolean
}

const cardClassName =
  "group flex min-h-13 items-center gap-3 bg-card px-3.5 py-2.5 transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-14 sm:gap-3.5 sm:rounded-lg sm:border sm:border-border/80 sm:p-3.5 sm:shadow-2xs sm:active:scale-[0.99] [@media(hover:hover)]:hover:border-foreground/20 [@media(hover:hover)]:hover:bg-muted/30"

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
  userPermissions,
  isSuperAdmin,
}: ModuleGridProps) {
  const visibleItems = isSuperAdmin
    ? items
    : userPermissions
      ? items.filter((item) => {
          // Sama seperti canSeeNavItem: any-of menang atas izin tunggal.
          if (item.permissions && item.permissions.length > 0) {
            return item.permissions.some((permission) => userPermissions.includes(permission))
          }
          return !item.permission || userPermissions.includes(item.permission)
        })
      : items

  return (
    <nav aria-label={ariaLabel} className="flex flex-col gap-4">
      {header}
      <ul
        className={cn(
          "flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card shadow-2xs sm:grid sm:grid-cols-2 sm:gap-4 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none lg:grid-cols-3",
          className
        )}
        {...(headingId ? { "aria-labelledby": headingId } : {})}
      >
        {visibleItems.map((item) => (
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
      aria-label={`${label}: ${desc}`}
      className={cardClassName}
    >
      <div
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/60 text-foreground transition-colors sm:size-9 sm:rounded-md [@media(hover:hover)]:group-hover:border-primary [@media(hover:hover)]:group-hover:bg-primary [@media(hover:hover)]:group-hover:text-primary-foreground"
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">
          {label}
        </p>
        <p className="truncate text-xs text-muted-foreground">{desc}</p>
      </div>
      <ChevronRight
        size={13}
        aria-hidden="true"
        className="shrink-0 text-muted-foreground/50 transition-all duration-150 [@media(hover:hover)]:group-hover:translate-x-0.5 [@media(hover:hover)]:group-hover:text-foreground/70"
      />
    </Link>
  )
}
