export const dynamic = "force-dynamic"

import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { SETTINGS_SECTIONS, settingsPermissions } from "@/components/layout/settings-sections"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pengaturan" }



export default async function SettingsPage() {
  // Izin hub = gabungan izin kartunya (any-of): pemegang `approve_workflows` atau
  // `manage_users` juga berhak membuka hub ini dan melihat kartu yang relevan saja.
  const user = await requireAnyPermission(settingsPermissions())
  const held = new Set(user.permissions)
  const isSuperAdmin = user.roles.includes("super_admin")
  const groups = SETTINGS_SECTIONS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isSuperAdmin || held.has(item.permission)),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pengaturan" }]} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Pengaturan</h1>
          <p className="text-sm text-muted-foreground">Kelola konfigurasi sistem, pengguna, dan keamanan.</p>
        </div>
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.heading}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.heading}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
