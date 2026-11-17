export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/shadcn/button"
import { Badge } from "@/components/ui/shadcn/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/shadcn/card"
import { AlertTriangle, CheckCircle2, Pencil } from "@/components/ui/fontawesome-icons"

import {
  isMappingFilled,
  mappingAccountLabel,
} from "./_lib/mapping-account-label"
import { loadMappingAccounts } from "./_lib/load-mapping-accounts"
import { ACCOUNT_MAPPING_CATALOG } from "@/lib/utils/account-mapping-catalog"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Mapping Akun" }

function AccountCard({ label, value }: { label: string; value: string }) {
  const isSet = isMappingFilled(value)
  return (
    <div className={`rounded-lg border px-3 py-3 ${isSet ? "bg-card" : "border-destructive/30 bg-destructive/5"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-medium ${isSet ? "text-foreground" : "text-destructive"}`}>{value}</p>
    </div>
  )
}

function AccountSection({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  const mapped = items.filter((i) => isMappingFilled(i.value)).length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Badge variant="outline">{mapped}/{items.length}</Badge>
      </div>
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {items.map((item) => (
          <AccountCard key={`${title}-${item.label}`} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  )
}

export default async function AccountMappingPage() {
  await requirePermission("manage_settings")

  const settings = await prisma.systemSetting.findFirst()
  // Putaran 103: definisi kanonis yang sama dengan picker load-settings.ts —
  // aktif, belum dihapus, dan daun. Layar ini menjanjikan "siap posting";
  // akun induk/terhapus tidak pernah bisa menerima jurnal POSTED.
  const accounts = await loadMappingAccounts()

  function accountName(id: number | null | undefined): string {
    return mappingAccountLabel(id, accounts)
  }

  const settingsRecord = (settings ?? {}) as Record<string, unknown>

  const mappingGroups = ACCOUNT_MAPPING_CATALOG.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({
      label: item.label,
      value: accountName(settingsRecord[item.key] as number | null | undefined),
    })),
  }))

  const allMappings = mappingGroups.flatMap((g) => g.items)
  const mappedCount = allMappings.filter((i) => isMappingFilled(i.value)).length
  const totalMappings = allMappings.length
  const unmappedCount = totalMappings - mappedCount
  const mappingProgress = totalMappings > 0 ? Math.round((mappedCount / totalMappings) * 100) : 0

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pengaturan", href: "/pengaturan" }, { label: "Mapping Akun" }]} />

      <Card>
        <CardHeader>
          <CardTitle>Mapping Akun</CardTitle>
          <CardDescription>Pemetaan akun buku besar untuk posting jurnal otomatis.</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              <Link href="/pengaturan/mapping-akun/ubah"><Pencil className="size-3.5" aria-hidden="true" /> Ubah Mapping</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {unmappedCount === 0 ? (
                  <CheckCircle2 aria-hidden="true" className="size-5 text-emerald-500" />
                ) : (
                  <AlertTriangle aria-hidden="true" className="size-5 text-amber-500" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {unmappedCount === 0 ? "Semua akun tersambung" : `${unmappedCount} akun belum diset`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mappedCount} dari {totalMappings} akun sudah terpetakan
                  </p>
                </div>
              </div>
              <span className="text-lg font-bold tabular-nums text-foreground">{mappingProgress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${unmappedCount === 0 ? "bg-emerald-500" : "bg-primary"}`}
                style={{ width: `${mappingProgress}%` }}
              />
            </div>
          </div>

          {mappingGroups.map((group) => (
            <AccountSection key={group.title} title={group.title} items={group.items} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
