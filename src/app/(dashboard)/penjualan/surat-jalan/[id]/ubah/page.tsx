/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { DeliveryOrderForm } from "@/components/forms/delivery-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.deliveryOrder.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const salesOrders = await prisma.salesOrder.findMany({ where: { status: "approved" }, orderBy: { createdAt: "desc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "sales", href: "/penjualan/surat-jalan" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <DeliveryOrderForm deliveryOrder={data as any} salesOrders={salesOrders as any}/>
    </div>
  )
}
