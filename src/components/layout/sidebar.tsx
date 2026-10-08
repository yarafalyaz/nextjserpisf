"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Building2, ChevronRight,
} from "lucide-react"
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
import { navigation, canSeeNavItem, type NavItem } from "@/components/layout/navigation"

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

  /** Filter children and return visible items; return null if nothing remains */
  function filterChildren(children: NavItem[]): NavItem[] {
    return children.filter(canSee)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={cn("h-12 border-b border-sidebar-border flex items-center", isCollapsed ? "justify-center p-0" : "px-4 py-0")}>
        {companyLogo ? (
          <Link href="/" onClick={handleNav} className="flex items-center justify-center h-full">
            {/* Light logo — visible di mode terang, hidden di mode gelap. */}
            <SafeImage
              src={companyLogo}
              alt={companyName || "Logo"}
              width={isCollapsed ? 32 : 180}
              height={isCollapsed ? 32 : 36}
              style={
                isCollapsed
                  ? { width: "32px", height: "32px" }
                  : { width: "auto", height: "36px" }
              }
              priority
              className={`object-contain transition-all duration-200 dark:hidden ${
                isCollapsed ? "size-8" : "h-9 w-auto max-w-full"
              }`}
            />
            {/* Dark logo — hidden di mode terang, visible di mode gelap. */}
            {companyLogoDark ? (
              <SafeImage
                src={companyLogoDark}
                alt={companyName || "Logo"}
                width={isCollapsed ? 32 : 180}
                height={isCollapsed ? 32 : 36}
                style={
                  isCollapsed
                    ? { width: "32px", height: "32px" }
                    : { width: "auto", height: "36px" }
                }
                priority
                className={`object-contain transition-all duration-200 hidden dark:block ${
                  isCollapsed ? "size-8" : "h-9 w-auto max-w-full"
                }`}
              />
            ) : null}
          </Link>
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Building2 className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-bold">{companyName || "YaraERP"}</span>
                    <span className="truncate text-xs text-sidebar-foreground/70">Paket Perusahaan</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarMenu>
            {navigation.map((item) => {
              const Icon = item.icon

              // Leaf item (no children)
              if (!item.children) {
                if (!canSee(item)) return null
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
                      <Link href={item.href} onClick={handleNav}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              }

              // Group item — filter children first
              const visibleChildren = filterChildren(item.children)
              if (visibleChildren.length === 0) return null

              return (
                <Collapsible
                  key={item.href}
                  asChild
                  defaultOpen={isGroupActive(item)}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={item.label} isActive={isGroupActive(item)}>
                        <Icon />
                        <span>{item.label}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {visibleChildren.map((child) => (
                          <SidebarMenuSubItem key={child.href}>
                            <SidebarMenuSubButton asChild isActive={isActive(child.href)}>
                              <Link href={child.href} onClick={handleNav}>
                                <child.icon />
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
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

// Backwards-compatible alias (older imports used `Sidebar`).
export { AppSidebar as Sidebar }
