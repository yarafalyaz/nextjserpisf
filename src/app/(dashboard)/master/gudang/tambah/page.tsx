export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { WarehouseForm } from "@/components/forms/warehouse-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Gudang" }

export default async function CreateWarehousePage() {
  await requirePermission("create_warehouses")

  const generatedCode = await peekNextDocumentNumber("WH", "simple")
  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoWarehouseCode !== false

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Gudang", href: "/master/gudang" },
  { label: "Buat" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Gudang</h1>
      </div>
      <WarehouseForm generatedCode={generatedCode} enableAutoCode={enableAutoCode} />
    </div>
  )
}
