export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { SalesOrderForm } from "@/components/forms/sales-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateSalesOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ quotationId?: string }>
}) {
  await requirePermission("create_sales_orders")
  const params = await searchParams
  const quotationId = params.quotationId ? Number(params.quotationId) : undefined

  const customers = await prisma.customer.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  // Pre-fill from quotation if provided
  let quotation = null
  if (quotationId) {
    quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { sections: { include: { items: true } }, customer: true },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Sales",href:"/sales"},{label:"Orders",href:"/sales/orders"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Sales Order</h1>
      </div>
      <SalesOrderForm
        customers={customers}
        quotationId={quotationId}
        defaultCustomerId={quotation?.customerId}
      />
    </div>
  )
}
