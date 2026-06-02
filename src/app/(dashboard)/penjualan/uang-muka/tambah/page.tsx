export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DownPaymentForm } from "@/components/forms/down-payment-form"

export default async function CreateDownPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ quotationId?: string; salesOrderId?: string }>
}) {
  const params = await searchParams
  const quotationId = params.quotationId ? Number(params.quotationId) : undefined
  const _salesOrderId = params.salesOrderId ? Number(params.salesOrderId) : undefined

  const [customers, quotations] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.quotation.findMany({ where: { status: "approved" }, orderBy: { createdAt: "desc" }, select: { id: true, documentNo: true, customerId: true, grandTotal: true } }),
  ])

  // Pre-fill from quotation if provided
  const preselectedQuotation = quotationId ? quotations.find(q => q.id === quotationId) : undefined

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Sales", href: "/penjualan/pesanan" },
        { label: "Down Payments", href: "/penjualan/uang-muka" },
        { label: "Create" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Down Payment</h1>
      </div>
      <DownPaymentForm
        customers={customers as any}
        quotations={quotations as any}
        defaultQuotationId={quotationId}
        defaultCustomerId={preselectedQuotation?.customerId}
      />
    </div>
  )
}
