export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PaymentForm } from "@/components/forms/payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getActivePaymentMethods } from "@/lib/services/method.service"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Pembayaran" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_sales_orders")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const data = await prisma.salesPayment.findUnique({
    where: { id: numId },
  })

  if (!data) notFound()

  const payment = { id: data.id }

  const [invoices, accounts] = await Promise.all([prisma.salesInvoice.findMany({ where: { status: { not: "paid" } }, orderBy: { createdAt: "desc" }, include: { customer: { select: { name: true } } } }), prisma.account.findMany({ where: { type: "ASSET" }, orderBy: { code: "asc" } })])
  const paymentMethods = await getActivePaymentMethods()

  const invoiceOptions = invoices.map((inv) => ({
    id: inv.id,
    documentNo: inv.documentNo,
    grandTotal: String(inv.grandTotal),
    paidAmount: String(inv.paidAmount),
    customer: { name: inv.customer.name },
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan/pembayaran" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <PaymentForm payment={payment} invoices={invoiceOptions} accounts={accounts} paymentMethods={paymentMethods}/>
    </div>
  )
}
