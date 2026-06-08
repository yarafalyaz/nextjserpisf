export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { SalesReturnForm } from "@/components/forms/sales-return-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateSalesReturnPage() {
  await requirePermission("create_sales_returns")

  const [invoices, customers, items] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: ["posted", "sent"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Retur", href: "/penjualan/retur" },
  { label: "Tambah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Retur Penjualan</h1>
      </div>
      <SalesReturnForm invoices={invoices} customers={customers} items={items} />
    </div>
  )
}
