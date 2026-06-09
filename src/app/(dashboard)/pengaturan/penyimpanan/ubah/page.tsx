export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { StorageForm } from "./_components/storage-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Penyimpanan" }

export default async function EditStoragePage() {
  await requirePermission("manage_settings")
  const settings = await prisma.systemSetting.findFirst()

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Penyimpanan & CDN", href: "/pengaturan/penyimpanan" },
        { label: "Ubah" },
      ]} />
      <h1 className="text-2xl font-bold text-foreground">Konfigurasi Penyimpanan & CDN</h1>
      <StorageForm
        driver={settings?.storageDriver || "local"}
        fallbackLocal={settings?.storageFallbackLocal ?? true}
        assetBaseUrl={settings?.assetBaseUrl || ""}
        r2AccountId={settings?.r2AccountId || ""}
        r2AccessKeyId={settings?.r2AccessKeyId || ""}
        r2Bucket={settings?.r2Bucket || ""}
        hasSecret={!!settings?.r2SecretAccessKey}
      />
    </div>
  )
}
