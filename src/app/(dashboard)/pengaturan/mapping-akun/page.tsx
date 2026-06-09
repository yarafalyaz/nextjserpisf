export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/shadcn/button"
import { Badge } from "@/components/ui/shadcn/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/shadcn/card"
import { AlertTriangle, CheckCircle2, Pencil } from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Mapping Akun" }

function AccountCard({ label, value }: { label: string; value: string }) {
  const isSet = value !== "Belum diset"
  return (
    <div className={`rounded-lg border px-3 py-3 ${isSet ? "bg-card" : "border-destructive/30 bg-destructive/5"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-medium ${isSet ? "text-foreground" : "text-destructive"}`}>{value}</p>
    </div>
  )
}

function AccountSection({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  const mapped = items.filter((i) => i.value !== "Belum diset").length
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
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
  const accounts = await prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })

  function accountName(id: number | null | undefined): string {
    if (!id) return "Belum diset"
    const acc = accounts.find((a) => a.id === id)
    return acc ? `${acc.code} - ${acc.name}` : "Belum diset"
  }

  const mappingGroups = [
    {
      title: "Penjualan",
      items: [
        { label: "Piutang Usaha", value: accountName(settings?.salesReceivableAccountId) },
        { label: "Pendapatan Penjualan", value: accountName(settings?.salesRevenueAccountId) },
        { label: "PPN Keluaran", value: accountName(settings?.salesTaxAccountId) },
        { label: "Retur Penjualan", value: accountName(settings?.salesReturnAccountId) },
        { label: "Akun Penjualan", value: accountName(settings?.salesAccountId) },
      ],
    },
    {
      title: "Pembelian",
      items: [
        { label: "Hutang Usaha", value: accountName(settings?.purchasePayableAccountId) },
        { label: "Persediaan", value: accountName(settings?.purchaseInventoryAccountId) },
        { label: "PPN Masukan", value: accountName(settings?.purchaseTaxAccountId) },
        { label: "Beban Pembelian", value: accountName(settings?.purchaseExpenseAccountId) },
        { label: "Diskon Pembelian", value: accountName(settings?.purchaseDiscountAccountId) },
        { label: "Ongkos Kirim", value: accountName(settings?.purchaseShippingAccountId) },
        { label: "Retur Pembelian", value: accountName(settings?.purchaseReturnAccountId) },
      ],
    },
    {
      title: "Persediaan & Manufaktur",
      items: [
        { label: "Persediaan", value: accountName(settings?.inventoryAccountId) },
        { label: "Penyesuaian Persediaan", value: accountName(settings?.inventoryAdjustmentAccountId) },
        { label: "Penyesuaian Stok", value: accountName(settings?.stockAdjustmentAccountId) },
        { label: "HPP (COGS)", value: accountName(settings?.cogsAccountId) },
        { label: "WIP", value: accountName(settings?.wipAccountId) },
        { label: "Beban Material", value: accountName(settings?.materialExpenseAccountId) },
        { label: "Beban Pengeluaran Material", value: accountName(settings?.materialIssueExpenseAccountId) },
      ],
    },
    {
      title: "Umum & Kas",
      items: [
        { label: "Kas Kecil", value: accountName(settings?.pettyCashAccountId) },
        { label: "Kas & Bank", value: accountName(settings?.cashBankAccountId) },
        { label: "Beban Umum", value: accountName(settings?.generalExpenseAccountId) },
        { label: "Kas Default", value: accountName(settings?.defaultCashAccountId) },
      ],
    },
    {
      title: "Penggajian",
      items: [
        { label: "Beban Gaji", value: accountName(settings?.salaryExpenseAccountId) },
        { label: "Hutang Gaji", value: accountName(settings?.salariesPayableAccountId) },
        { label: "Bank Penggajian", value: accountName(settings?.payrollBankAccountId) },
        { label: "Piutang Karyawan", value: accountName(settings?.employeeReceivableAccountId) },
        { label: "Tipe Jurnal Penggajian", value: accountName(settings?.payrollJournalTypeId) },
      ],
    },
  ]

  const allMappings = mappingGroups.flatMap((g) => g.items)
  const mappedCount = allMappings.filter((i) => i.value !== "Belum diset").length
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
            <Button asChild variant="outline" size="sm">
              <Link href="/pengaturan/mapping-akun/ubah"><Pencil className="size-3.5" /> Ubah Mapping</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {unmappedCount === 0 ? (
                  <CheckCircle2 className="size-5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="size-5 text-amber-500" />
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
