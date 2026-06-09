export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SettingsEditForm } from "../../ubah/_components/settings-edit-form"
import { loadSettingsForEdit } from "../../ubah/_lib/load-settings"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Penawaran" }

export default async function EditQuotationPage() {
  await requirePermission("manage_settings")
  const { settings, accounts } = await loadSettingsForEdit()
  if (!settings) return <div className="p-6 text-destructive">Pengaturan tidak ditemukan.</div>

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Penawaran", href: "/pengaturan/penawaran" },
        { label: "Ubah" },
      ]} />
      <h1 className="text-2xl font-bold text-foreground">Ubah Pengaturan Penawaran</h1>
      <SettingsEditForm settings={settings} accounts={accounts} section="quotation" redirectTo="/pengaturan/penawaran" />
    </div>
  )
}
