export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PurchaseReturnForm } from "@/components/forms/purchase-return-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.purchaseReturn.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const returnData = {
    id: data.id,
    purchaseOrderId: data.purchaseOrderId,
    date: data.date.toISOString().split("T")[0],
    reason: data.reason,
  }

  const [purchaseOrders, items] = await Promise.all([prisma.purchaseOrder.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, documentNo: true } }), prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Retur", href: "/pembelian/retur" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <PurchaseReturnForm returnData={returnData} purchaseOrders={purchaseOrders} items={items}/>
    </div>
  )
}
