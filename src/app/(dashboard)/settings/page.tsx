export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function SettingsPage() {
  await requirePermission("manage_settings")

  const settings = await prisma.systemSetting.findFirst()
  const accounts = await prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Settings" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-5" style={{ gridTemplateColumns: "1fr" }}>
        {/* Company Info */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Informasi Perusahaan</h2>
          </div>
          <div className="p-4 px-5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama Perusahaan</span>
                <span className="text-[0.9375rem] text-foreground font-medium">{settings?.companyName || "-"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Email</span>
                <span className="text-[0.9375rem] text-foreground font-medium">{settings?.companyEmail || "-"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Telepon</span>
                <span className="text-[0.9375rem] text-foreground font-medium">{settings?.companyPhone || "-"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Mata Uang</span>
                <span className="text-[0.9375rem] text-foreground font-medium">{settings?.currencyCode} ({settings?.currencySymbol})</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Metode Costing</span>
                <span className="text-[0.9375rem] text-foreground font-medium">{settings?.costingMethod || "FIFO"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Awal Tahun Fiskal</span>
                <span className="text-[0.9375rem] text-foreground font-medium">Bulan {settings?.fiscalYearStartMonth || 1}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Account Mapping */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Mapping Akun</h2>
          </div>
          <div className="p-4 px-5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Piutang Usaha</span>
                <span className="text-[0.9375rem] text-foreground font-medium">
                  {accounts.find((a) => a.id === settings?.salesReceivableAccountId)?.name || "Belum diset"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Pendapatan Penjualan</span>
                <span className="text-[0.9375rem] text-foreground font-medium">
                  {accounts.find((a) => a.id === settings?.salesRevenueAccountId)?.name || "Belum diset"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">PPN Keluaran</span>
                <span className="text-[0.9375rem] text-foreground font-medium">
                  {accounts.find((a) => a.id === settings?.salesTaxAccountId)?.name || "Belum diset"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Hutang Usaha</span>
                <span className="text-[0.9375rem] text-foreground font-medium">
                  {accounts.find((a) => a.id === settings?.purchasePayableAccountId)?.name || "Belum diset"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Persediaan</span>
                <span className="text-[0.9375rem] text-foreground font-medium">
                  {accounts.find((a) => a.id === settings?.inventoryAccountId)?.name || "Belum diset"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">WIP</span>
                <span className="text-[0.9375rem] text-foreground font-medium">
                  {accounts.find((a) => a.id === settings?.wipAccountId)?.name || "Belum diset"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Pengaturan Lainnya</h2>
          </div>
          <div className="p-4 px-5">
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link href="/settings/users" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Users & Roles</Link>
              <Link href="/master/accounts" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Chart of Accounts</Link>
              <Link href="/master/warehouses" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Warehouses</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
