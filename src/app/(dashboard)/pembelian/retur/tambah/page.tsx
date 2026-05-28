export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PurchaseReturnForm } from "@/components/forms/purchase-return-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreatePurchaseReturnPage() {
  await requirePermission("create_purchase_returns")

  const [purchaseOrders, items] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["received", "ordered"] }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Purchase", href: "/pembelian" },
  { label: "Returns", href: "/pembelian/retur" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Purchase Return</h1>
      </div>
      <PurchaseReturnForm purchaseOrders={purchaseOrders} items={items} />
    </div>
  )
}
