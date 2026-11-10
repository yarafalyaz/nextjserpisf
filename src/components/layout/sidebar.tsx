"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Building2, ChevronRight,
} from "@/components/ui/fontawesome-icons"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/shadcn/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/shadcn/collapsible"
import { NavUser } from "@/components/layout/nav-user"
import { SafeImage } from "@/components/ui/safe-image"
import { navigation, canSeeNavItem, visibleGroupChildren, type NavItem } from "@/components/layout/navigation"

interface AppSidebarProps {
  companyName?: string
  companyLogo?: string
  companyLogoDark?: string
  permissions?: string[]
  roles?: string[]
}

function useActive() {
  const pathname = usePathname()
  return {
    isActive: (href: string) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"),
    isGroupActive: (item: NavItem) =>
      item.children?.some((c) =>
        c.href === "/" ? pathname === "/" : pathname === c.href || pathname.startsWith(c.href + "/")
      ) ?? false,
    pathname,
  }
}

import { cn } from "@/lib/utils"

const NAV_SECTIONS: { label: string; hrefs: string[] }[] = [
  { label: "Ringkasan", hrefs: ["/"] },
  { label: "Operasional & Bengkel", hrefs: ["/proyek", "/kendaraan", "/produksi", "/inventaris"] },
  { label: "Komersial & Keuangan", hrefs: ["/penjualan", "/pembelian", "/keuangan", "/crm"] },
  { label: "Organisasi & Sistem", hrefs: ["/sdm", "/aset", "/master", "/laporan", "/kalender", "/pengaturan"] },
]

export function AppSidebar({ companyName, companyLogo, companyLogoDark, permissions = [], roles = [] }: AppSidebarProps) {
  const { isActive, isGroupActive } = useActive()
  const { state, setOpenMobile, isMobile } = useSidebar()

  const handleNav = () => {
    if (isMobile) setOpenMobile(false)
  }

  const isCollapsed = state === "collapsed"
  const isSuperAdmin = roles.includes("super_admin")

  /** Check if a single nav item is visible to the current user */
  function canSee(item: NavItem): boolean {
    return canSeeNavItem(item, permissions, isSuperAdmin)
  }

  const navByHref = new Map(navigation.map((item) => [item.href, item]))

  function renderNavItem(item: NavItem) {
    const Icon = item.icon

    // Leaf item (no children)
    if (!item.children) {
      if (!canSee(item)) return null
      return (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            asChild
            isActive={isActive(item.href)}
            tooltip={item.label}
            className="min-h-10 md:min-h-8 text-[13px] font-medium data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
          >
            <Link href={item.href} onClick={handleNav}>
              <Icon className="opacity-80" />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    }

    // Group item — filter children first
    const visibleChildren = visibleGroupChildren(item, permissions, isSuperAdmin)
    if (!visibleChildren) return null

    // Grup berkatalog (`sidebarLinkOnly`): sidebar menautkan ke halaman
    // grupnya saja. 47 laporan sebagai submenu menenggelamkan modul lain
    // dan tidak bisa dicari; daftarnya dibaca di katalog `/laporan`
    // (kategori + kotak Cari). `children` tetap dipakai sebagai sumber
    // label/ikon/izin untuk katalog, breadcrumb, dan command palette.
    if (item.sidebarLinkOnly) {
      return (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            asChild
            isActive={isActive(item.href) || isGroupActive(item)}
            tooltip={item.label}
            className="min-h-10 md:min-h-8 text-[13px] font-medium data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
          >
            <Link href={item.href} onClick={handleNav}>
              <Icon className="opacity-80" />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    }

    return (
      <Collapsible
        key={item.href}
        asChild
        defaultOpen={isGroupActive(item)}
        className="group/collapsible"
      >
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              tooltip={item.label}
              isActive={isGroupActive(item)}
              className="min-h-10 md:min-h-8 text-[13px] font-medium data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
            >
              <Icon className="opacity-80" />
              {/*
                Label grup bisa diklik menuju halaman ringkasan modul (hub),
                sedangkan klik di area lain tetap membuka/menutup daftar anak
                — `stopPropagation` mencegah keduanya terjadi sekaligus.
              */}
              <Link
                href={item.href}
                onClick={(event) => {
                  handleNav()
                  event.stopPropagation()
                }}
                className="truncate hover:underline"
              >
                {item.label}
              </Link>
              <ChevronRight className="ml-auto size-3.5 text-sidebar-foreground/60 transition-transform duration-150 ease-out group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {visibleChildren.map((child) => (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActive(child.href)}
                    className="h-9 md:h-7 text-[13px] md:text-[12.5px] data-[active=true]:font-semibold"
                  >
                    <Link href={child.href} onClick={handleNav}>
                      <child.icon className="size-3.5 opacity-75" />
                      <span>{child.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    )
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={cn("h-12 border-b border-sidebar-border flex items-center", isCollapsed ? "justify-center p-0" : "px-3.5 py-0")}>
        {companyLogo ? (
          <Link href="/" onClick={handleNav} className="flex items-center justify-center h-full">
            {/* Light logo — visible di mode terang, hidden di mode gelap. */}
            <SafeImage
              src={companyLogo}
              alt={companyName || "Logo"}
              width={isCollapsed ? 28 : 160}
              height={isCollapsed ? 28 : 30}
              style={
                isCollapsed
                  ? { width: "28px", height: "28px" }
                  : { width: "auto", height: "30px" }
              }
              priority
              className={`object-contain transition-opacity duration-150 dark:hidden ${
                isCollapsed ? "size-7" : "h-7.5 w-auto max-w-full"
              }`}
            />
            {/* Dark logo — hidden di mode terang, visible di mode gelap. */}
            {companyLogoDark ? (
              <SafeImage
                src={companyLogoDark}
                alt={companyName || "Logo"}
                width={isCollapsed ? 28 : 160}
                height={isCollapsed ? 28 : 30}
                style={
                  isCollapsed
                    ? { width: "28px", height: "28px" }
                    : { width: "auto", height: "30px" }
                }
                priority
                className={`object-contain transition-opacity duration-150 hidden dark:block ${
                  isCollapsed ? "size-7" : "h-7.5 w-auto max-w-full"
                }`}
              />
            ) : null}
          </Link>
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild className="h-10 px-1.5">
                <Link href="/">
                  <div className="flex aspect-square size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Building2 className="size-3.5" />
                  </div>
                  <div className="grid flex-1 text-left text-xs leading-tight">
                    <span className="truncate font-semibold tracking-tight text-foreground">{companyName || "YaraERP"}</span>
                    <span className="truncate text-[11px] text-sidebar-foreground/70">ERP Bengkel Fabrikasi</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0 py-1.5">
        {NAV_SECTIONS.map((section) => {
          const renderedItems = section.hrefs
            .map((href) => navByHref.get(href))
            .filter((item): item is NavItem => Boolean(item))
            .map((item) => renderNavItem(item))
            .filter(Boolean)

          if (renderedItems.length === 0) return null

          return (
            <SidebarGroup key={section.label} className="px-2 py-1">
              <SidebarGroupLabel className="h-6 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                {section.label}
              </SidebarGroupLabel>
              <SidebarMenu className="gap-0.5">{renderedItems}</SidebarMenu>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

// Backwards-compatible alias (older imports used `Sidebar`).
export { AppSidebar as Sidebar }
