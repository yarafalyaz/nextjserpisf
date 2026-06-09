export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AssetBrandForm } from "@/components/forms/asset-brand-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Merek Kendaraan" }

export default async function CreateAssetBrandPage() {
  await requirePermission("create_assets")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Aset", href: "/aset" },
  { label: "Merek", href: "/aset/merek" },
  { label: "Tambah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Merek Aset</h1>
      </div>
      <AssetBrandForm />
    </div>
  )
}
