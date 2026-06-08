export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { DownPaymentForm } from "@/components/forms/down-payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getActivePaymentMethods } from "@/lib/services/method.service"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.downPayment.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const downPayment = {
    id: data.id,
    customerId: data.customerId,
    quotationId: data.quotationId,
    amount: Number(data.amount),
    date: data.paymentDate.toISOString().split("T")[0],
    notes: data.notes,
  }

  const [customers, quotations] = await Promise.all([prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }), prisma.quotation.findMany({ where: { status: "approved" }, orderBy: { createdAt: "desc" }, select: { id: true, documentNo: true, customerId: true } })])
  const paymentMethods = await getActivePaymentMethods()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan/uang-muka" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <DownPaymentForm downPayment={downPayment} customers={customers} quotations={quotations} paymentMethods={paymentMethods}/>
    </div>
  )
}
