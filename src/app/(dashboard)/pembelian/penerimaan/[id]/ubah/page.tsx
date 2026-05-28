export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { GoodsReceiptForm } from "@/components/forms/goods-receipt-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.goodsReceipt.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const [purchaseOrders, warehouses] = await Promise.all([prisma.purchaseOrder.findMany({ where: { status: "approved" }, orderBy: { createdAt: "desc" } }), prisma.warehouse.findMany({ orderBy: { name: "asc" } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "purchase", href: "/pembelian/penerimaan" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit</h1>
      </div>
      <GoodsReceiptForm receipt={data as any} purchaseOrders={purchaseOrders as any} warehouses={warehouses as any}/>
    </div>
  )
}
