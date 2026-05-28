export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { WarehouseForm } from "@/components/forms/warehouse-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"

export default async function CreateWarehousePage() {
  await requirePermission("create_warehouses")

  const generatedCode = await peekNextDocumentNumber("WH", "simple")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Warehouses", href: "/master/gudang" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Gudang</h1>
      </div>
      <WarehouseForm generatedCode={generatedCode} />
    </div>
  )
}
