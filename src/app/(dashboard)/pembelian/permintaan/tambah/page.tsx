export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PurchaseRequestForm } from "@/components/forms/purchase-request-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreatePurchaseRequestPage() {
  await requirePermission("create_purchase_requests")

  const [items, employees] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unitOfMeasure: true },
    }),
    prisma.employee.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/purchase"},{label:"Permintaan",href:"/purchase/requests"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Purchase Request</h1>
      </div>
      <PurchaseRequestForm items={items} employees={employees} />
    </div>
  )
}
