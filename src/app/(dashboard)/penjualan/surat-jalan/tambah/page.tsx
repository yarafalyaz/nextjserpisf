export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { DeliveryOrderForm } from "@/components/forms/delivery-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateDeliveryOrderPage() {
  await requirePermission("create_delivery_orders")

  const salesOrders = await prisma.salesOrder.findMany({
    where: {
      deletedAt: null,
      status: { in: ["approved", "confirmed"] },
    },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  })

  const formData = salesOrders.map((so) => ({
    id: so.id,
    documentNo: so.documentNo,
    customer: { name: so.customer.name },
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Surat Jalan",href:"/penjualan/surat-jalan"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Delivery Order</h1>
      </div>
      <DeliveryOrderForm salesOrders={formData} />
    </div>
  )
}
