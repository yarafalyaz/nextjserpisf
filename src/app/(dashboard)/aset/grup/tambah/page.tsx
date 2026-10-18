import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AssetGroupForm } from "@/components/forms/asset-group-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Grup Aset" }

export default async function CreateAssetGroupPage() {
  await requirePermission("create_asset_groups")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Aset", href: "/aset" },
          { label: "Grup Aset", href: "/aset/grup" },
          { label: "Tambah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Grup Aset</h1>
      </div>
      <AssetGroupForm />
    </div>
  )
}
