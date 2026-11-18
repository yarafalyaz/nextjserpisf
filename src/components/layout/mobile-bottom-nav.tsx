"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  Grid3X3,
  Landmark,
  LayoutDashboard,
  ShoppingCart,
  Wrench,
} from "@/components/ui/fontawesome-icons"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/shadcn/sheet"
import {
  canSeeNavItem,
  navigation,
  visibleGroupChildren,
  type NavItem,
} from "@/components/layout/navigation"
import { cn } from "@/lib/utils"

interface MobileNavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  matchPrefix?: string[]
  requiresAnyHref?: string[]
}

const ALL_PRIMARY_TABS: MobileNavItem[] = [
  {
    label: "Dasbor",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Proyek",
    href: "/proyek",
    icon: Wrench,
    matchPrefix: ["/proyek", "/kendaraan", "/produksi"],
    requiresAnyHref: ["/proyek", "/kendaraan", "/produksi"],
  },
  {
    label: "Penjualan",
    href: "/penjualan",
    icon: ShoppingCart,
    matchPrefix: ["/penjualan", "/crm"],
    requiresAnyHref: ["/penjualan", "/crm"],
  },
  {
    label: "Keuangan",
    href: "/keuangan",
    icon: Landmark,
    matchPrefix: ["/keuangan", "/laporan"],
    requiresAnyHref: ["/keuangan", "/laporan"],
  },
  {
    label: "Inventaris",
    href: "/inventaris",
    icon: Boxes,
    matchPrefix: ["/inventaris", "/pembelian"],
    requiresAnyHref: ["/inventaris", "/pembelian"],
  },
]

const LAUNCHER_SECTIONS: { label: string; hrefs: string[] }[] = [
  { label: "Ringkasan", hrefs: ["/"] },
  { label: "Operasional & Bengkel", hrefs: ["/proyek", "/kendaraan", "/produksi", "/inventaris"] },
  { label: "Komersial & Keuangan", hrefs: ["/penjualan", "/pembelian", "/keuangan", "/crm"] },
  { label: "Organisasi & Sistem", hrefs: ["/sdm", "/aset", "/master", "/laporan", "/kalender", "/pengaturan"] },
]

interface MobileBottomNavProps {
  permissions?: string[]
  roles?: string[]
}

export function MobileBottomNav({ permissions = [], roles = [] }: MobileBottomNavProps = {}) {
  const pathname = usePathname()
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [selectedModule, setSelectedModule] = useState<NavItem | null>(null)

  const isSuperAdmin = roles.includes("super_admin")
  const navByHref = new Map(navigation.map((item) => [item.href, item]))

  function isModuleVisible(item: NavItem): boolean {
    if (!item.children) return canSeeNavItem(item, permissions, isSuperAdmin)
    return visibleGroupChildren(item, permissions, isSuperAdmin) !== null
  }

  const visibleBottomTabs = ALL_PRIMARY_TABS.filter((tab) => {
    if (!tab.requiresAnyHref) return true
    if (permissions.length === 0 && roles.length === 0) return tab.href !== "/inventaris"
    return tab.requiresAnyHref.some((href) => {
      const mod = navByHref.get(href)
      return mod ? isModuleVisible(mod) : false
    })
  }).slice(0, 4)

  function isItemActive(item: MobileNavItem): boolean {
    if (launcherOpen) return false
    if (item.href === "/") return pathname === "/"
    const prefixes = item.matchPrefix ?? [item.href]
    return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  }

  function isRouteActive(href: string): boolean {
    return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
  }

  function handleOpenLauncher() {
    setSelectedModule(null)
    setLauncherOpen(true)
  }

  function handleCloseLauncher() {
    setLauncherOpen(false)
    setSelectedModule(null)
  }

  const selectedChildren =
    selectedModule?.children
      ? visibleGroupChildren(selectedModule, permissions, isSuperAdmin) ?? []
      : []

  return (
    <>
      <nav
        aria-label="Navigasi cepat seluler"
        className="no-print fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-border/80 bg-background/90 backdrop-blur-md supports-backdrop-filter:bg-background/80 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div
          className={cn(
            "grid h-14 w-full items-center px-1",
            visibleBottomTabs.length === 4 && "grid-cols-5",
            visibleBottomTabs.length === 3 && "grid-cols-4",
            visibleBottomTabs.length === 2 && "grid-cols-3",
            visibleBottomTabs.length <= 1 && "grid-cols-2",
          )}
        >
          {visibleBottomTabs.map((item) => {
            const Icon = item.icon
            const active = isItemActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleCloseLauncher}
                className={cn(
                  "group relative flex h-full min-h-11 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-all duration-150 active:scale-95 active:opacity-75",
                  active
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
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
                    "size-4 transition-colors duration-150",
                    active ? "text-primary opacity-100" : "opacity-70",
                  )}
                  aria-hidden="true"
                />
                <span className="max-w-[62px] truncate tracking-tight">{item.label}</span>
              </Link>
            )
          })}

          <button
            type="button"
            onClick={() => (launcherOpen ? handleCloseLauncher() : handleOpenLauncher())}
            aria-label="Buka peluncur modul"
            aria-expanded={launcherOpen}
            className={cn(
              "group relative flex h-full min-h-11 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-all duration-150 active:scale-95 active:opacity-75",
              launcherOpen
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {launcherOpen && (
              <span
                aria-hidden="true"
                className="absolute top-0 h-0.5 w-6 rounded-full bg-primary"
              />
            )}
            <Grid3X3
              className={cn(
                "size-4 transition-colors duration-150",
                launcherOpen ? "text-primary opacity-100" : "opacity-70",
              )}
              aria-hidden="true"
            />
            <span className="max-w-[62px] truncate tracking-tight">Modul</span>
          </button>
        </div>
      </nav>

      {/* Mobile App Module Launcher Sheet */}
      <Sheet open={launcherOpen} onOpenChange={(open) => (open ? setLauncherOpen(true) : handleCloseLauncher())}>
        <SheetContent
          side="bottom"
          className="max-h-[82dvh] rounded-t-2xl px-0 pb-6 pt-2 md:hidden"
          style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          <SheetHeader className="border-b border-border/70 px-4 pb-3 pt-1 text-left">
            {selectedModule ? (
              <div className="flex items-center gap-2 pr-8">
                <button
                  type="button"
                  onClick={() => setSelectedModule(null)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95"
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  Semua Modul
                </button>
                <span className="text-muted-foreground/50">/</span>
                <SheetTitle className="truncate text-sm font-semibold">
                  {selectedModule.label}
                </SheetTitle>
              </div>
            ) : (
              <>
                <SheetTitle className="text-base font-semibold">Semua Modul ERP</SheetTitle>
                <SheetDescription className="text-xs">
                  Pilih modul operasional, keuangan, atau master data
                </SheetDescription>
              </>
            )}
          </SheetHeader>

          <div className="overflow-y-auto px-4 pt-3">
            {selectedModule ? (
              <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border bg-card overflow-hidden">
                {selectedChildren.map((child) => {
                  const ChildIcon = child.icon
                  const active = isRouteActive(child.href)
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={handleCloseLauncher}
                      className={cn(
                        "flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors active:bg-muted/70",
                        active ? "bg-muted/50 font-semibold text-foreground" : "text-foreground",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                          <ChildIcon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="truncate">{child.label}</span>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-5 pb-2">
                {LAUNCHER_SECTIONS.map((section) => {
                  const items = section.hrefs
                    .map((href) => navByHref.get(href))
                    .filter((item): item is NavItem => Boolean(item && isModuleVisible(item)))

                  if (items.length === 0) return null

                  return (
                    <div key={section.label} className="flex flex-col gap-2">
                      <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {section.label}
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {items.map((item) => {
                          const Icon = item.icon
                          const active = isRouteActive(item.href)
                          const hasSubmenu = Boolean(item.children && !item.sidebarLinkOnly)

                          if (hasSubmenu) {
                            return (
                              <button
                                key={item.href}
                                type="button"
                                onClick={() => setSelectedModule(item)}
                                className={cn(
                                  "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center transition-transform duration-100 active:scale-95",
                                  active
                                    ? "border-primary/40 bg-primary/5 text-foreground"
                                    : "border-border bg-card text-foreground",
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex size-9 items-center justify-center rounded-lg",
                                    active
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-foreground",
                                  )}
                                >
                                  <Icon className="size-4" aria-hidden="true" />
                                </span>
                                <span className="line-clamp-1 text-[11px] font-medium leading-tight">
                                  {item.label}
                                </span>
                              </button>
                            )
                          }

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={handleCloseLauncher}
                              className={cn(
                                "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center transition-transform duration-100 active:scale-95",
                                active
                                  ? "border-primary/40 bg-primary/5 text-foreground"
                                  : "border-border bg-card text-foreground",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex size-9 items-center justify-center rounded-lg",
                                  active
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-foreground",
                                )}
                              >
                                <Icon className="size-4" aria-hidden="true" />
                              </span>
                              <span className="line-clamp-1 text-[11px] font-medium leading-tight">
                                {item.label}
                              </span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
