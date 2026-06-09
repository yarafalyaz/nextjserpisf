export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DownPaymentForm } from "@/components/forms/down-payment-form"
import { getActivePaymentMethods } from "@/lib/services/method.service"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Uang Muka" }

export default async function CreateDownPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ quotationId?: string; salesOrderId?: string }>
}) {
  const params = await searchParams
  const quotationId = params.quotationId ? Number(params.quotationId) : undefined

  const [customers, quotations, paymentMethods] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.quotation.findMany({ where: { status: "approved" }, orderBy: { createdAt: "desc" }, select: { id: true, documentNo: true, customerId: true, grandTotal: true } }),
    getActivePaymentMethods(),
  ])

  // Pre-fill from quotation if provided
  const preselectedQuotation = quotationId ? quotations.find(q => q.id === quotationId) : undefined

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Penjualan", href: "/penjualan/pesanan" },
        { label: "Uang Muka", href: "/penjualan/uang-muka" },
        { label: "Tambah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Uang Muka</h1>
      </div>
      <DownPaymentForm
        customers={customers}
        quotations={quotations}
        defaultQuotationId={quotationId}
        defaultCustomerId={preselectedQuotation?.customerId}
        paymentMethods={paymentMethods}
      />
    </div>
  )
}
