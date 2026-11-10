"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ShoppingCart,
  Landmark,
  Boxes,
  PanelLeftIcon,
} from "@/components/ui/fontawesome-icons"
import { useSidebar } from "@/components/ui/shadcn/sidebar"
import { cn } from "@/lib/utils"

interface MobileNavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  matchPrefix?: string[]
}

const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  {
    label: "Dasbor",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Penjualan",
    href: "/penjualan",
    icon: ShoppingCart,
    matchPrefix: ["/penjualan", "/crm"],
  },
  {
    label: "Keuangan",
    href: "/keuangan",
    icon: Landmark,
    matchPrefix: ["/keuangan", "/laporan"],
  },
  {
    label: "Operasional",
    href: "/inventaris",
    icon: Boxes,
    matchPrefix: ["/inventaris", "/pembelian", "/produksi", "/proyek", "/kendaraan"],
  },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const { openMobile, setOpenMobile } = useSidebar()

  function isItemActive(item: MobileNavItem): boolean {
    if (openMobile) return false
    if (item.href === "/") return pathname === "/"
    const prefixes = item.matchPrefix ?? [item.href]
    return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  }

  return (
    <nav
      aria-label="Navigasi cepat seluler"
      className="no-print fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-border/80 bg-background/90 backdrop-blur-md supports-backdrop-filter:bg-background/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid h-13 w-full grid-cols-5 items-center px-1">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = isItemActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpenMobile(false)}
              className={cn(
                "group relative flex h-full flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-colors duration-150 active:opacity-70",
                active
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-6 rounded-full bg-primary"
                />
              )}
              <Icon
                className={cn(
                  "size-4 transition-transform duration-150",
                  active ? "text-primary opacity-100" : "opacity-70"
                )}
                aria-hidden="true"
              />
              <span className="truncate max-w-[62px] tracking-tight">{item.label}</span>
            </Link>
          )
        })}

        <button
          type="button"
          onClick={() => setOpenMobile(!openMobile)}
          aria-label="Buka menu modul lengkap"
          aria-expanded={openMobile}
          className={cn(
            "group relative flex h-full flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-colors duration-150 active:opacity-70",
            openMobile
              ? "text-foreground font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {openMobile && (
            <span
              aria-hidden="true"
              className="absolute top-0 h-0.5 w-6 rounded-full bg-primary"
            />
          )}
          <PanelLeftIcon
            className={cn(
              "size-4 transition-transform duration-150",
              openMobile ? "text-primary opacity-100" : "opacity-70"
            )}
            aria-hidden="true"
          />
          <span className="truncate max-w-[62px] tracking-tight">Menu</span>
        </button>
      </div>
    </nav>
  )
}
