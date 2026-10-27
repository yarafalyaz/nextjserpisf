export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { VendorPaymentForm } from "@/components/forms/vendor-payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getActivePaymentMethods } from "@/lib/services/method.service"
import { PaymentReversalNotice } from "@/components/ui/payment-reversal-button"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Pembayaran Pemasok" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_vendor_payments")

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) => prisma.vendorPayment.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.vendorPayment.findUnique({ where: { id, ...where } }),
    },
  )

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
    adminFee: Number(data.adminFee),
    vendorBillId: data.vendorBillId,
  }

  const [vendors, bills] = await Promise.all([prisma.vendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }), prisma.vendorBill.findMany({ where: { status: { notIn: ["paid", "cancelled"] }, deletedAt: null }, orderBy: { createdAt: "desc" } })])
  const paymentMethods = await getActivePaymentMethods()

  const billOptions = bills.map((b) => ({
    id: b.id,
    documentNo: b.documentNo,
    vendorId: b.vendorId,
    grandTotal: Number(b.grandTotal),
    balanceDue: Number(b.balanceDue),
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pembayaran Pemasok", href: "/pembelian/pembayaran-vendor" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      {data.status === "reversed" ? (
        <PaymentReversalNotice
          status={data.status}
          reversalReason={data.reversalReason}
          reversedAt={data.reversedAt}
        />
      ) : (
        <VendorPaymentForm payment={payment} vendors={vendors} bills={billOptions} paymentMethods={paymentMethods}/>
      )}
    </div>
  )
}
