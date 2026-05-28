export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VendorBillForm } from "@/components/forms/vendor-bill-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateVendorBillPage() {
  await requirePermission("create_vendor_bills")

  const [vendors, items] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, cost: true, unitOfMeasure: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Tagihan",href:"/pembelian/tagihan"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Vendor Bill</h1>
      </div>
      <VendorBillForm
        vendors={vendors}
        items={JSON.parse(JSON.stringify(items))}
      />
    </div>
  )
}
