export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/shadcn/button"
import { Badge } from "@/components/ui/shadcn/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/shadcn/card"
import { Pencil } from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Preferensi" }

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || "-"}</span>
    </div>
  )
}

function BoolBadge({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Badge variant="outline" className={value
        ? "w-fit border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
        : "w-fit"
      }>
        {value ? "Aktif" : "Nonaktif"}
      </Badge>
    </div>
  )
}

export default async function PreferencesPage() {
  await requirePermission("manage_settings")
  const settings = await prisma.systemSetting.findFirst()

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pengaturan", href: "/pengaturan" }, { label: "Preferensi" }]} />

      <Card>
        <CardHeader>
          <CardTitle>Preferensi Sistem</CardTitle>
          <CardDescription>Mata uang, periode fiskal, dan preferensi tampilan global.</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/pengaturan/preferensi/ubah"><Pencil className="size-3.5" /> Ubah</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Metode Costing" value={settings?.costingMethod} />
            <Field label="Awal Tahun Fiskal" value={`Bulan ${settings?.fiscalYearStartMonth || 1}`} />
            <Field label="Kode Mata Uang" value={settings?.currencyCode} />
            <Field label="Simbol Mata Uang" value={settings?.currencySymbol} />
            <Field label="Locale" value={settings?.currencyLocale} />
            <Field label="Tanggal Kunci Periode" value={settings?.periodLockDate ? settings.periodLockDate.toISOString().split("T")[0] : null} />
            <BoolBadge label="Tampilkan Is Active" value={settings?.showIsActiveField !== false} />
            <BoolBadge label="Tampilkan NPWP" value={settings?.showTaxId !== false} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
