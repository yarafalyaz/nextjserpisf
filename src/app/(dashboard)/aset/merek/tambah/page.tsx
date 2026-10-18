export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AssetBrandForm } from "@/components/forms/asset-brand-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Merek Kendaraan" }

export default async function CreateAssetBrandPage() {
  await requirePermission("create_asset_brands")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Aset", href: "/aset" },
  { label: "Merek", href: "/aset/merek" },
  { label: "Tambah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Merek Aset</h1>
      </div>
      <AssetBrandForm />
    </div>
  )
}
