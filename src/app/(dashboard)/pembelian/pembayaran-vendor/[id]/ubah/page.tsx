export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { VendorPaymentForm } from "@/components/forms/vendor-payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getActivePaymentMethods } from "@/lib/services/method.service"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Pembayaran Vendor" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.vendorPayment.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const payment = {
    id: data.id,
    vendorId: data.vendorId,
    amount: Number(data.amount),
    date: data.paymentDate.toISOString().split("T")[0],
    accountId: data.accountId,
    notes: data.notes,
    referenceNumber: data.referenceNumber,
    bankAccount: data.bankAccount,
  }

  const [vendors, bills] = await Promise.all([prisma.vendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }), prisma.vendorBill.findMany({ where: { status: { not: "paid" } }, orderBy: { createdAt: "desc" } })])
  const paymentMethods = await getActivePaymentMethods()

  const billOptions = bills.map((b) => ({
    id: b.id,
    documentNo: b.documentNo,
    vendorId: b.vendorId,
    grandTotal: Number(b.grandTotal),
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pembayaran Vendor", href: "/pembelian/pembayaran-vendor" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <VendorPaymentForm payment={payment} vendors={vendors} bills={billOptions} paymentMethods={paymentMethods}/>
    </div>
  )
}
