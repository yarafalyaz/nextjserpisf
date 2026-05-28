export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { ProductionOrderForm } from "@/components/forms/production-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.productionOrder.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const products = await prisma.product.findMany({ orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "manufacturing", href: "/manufacturing/production-orders" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit</h1>
      </div>
      <ProductionOrderForm order={data as any} products={products as any}/>
    </div>
  )
}
