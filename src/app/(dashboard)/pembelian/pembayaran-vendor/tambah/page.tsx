export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VendorPaymentForm } from "@/components/forms/vendor-payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getActivePaymentMethods } from "@/lib/services/method.service"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pembayaran Vendor" }

export default async function CreateVendorPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ billId?: string }>
}) {
  await requirePermission("create_vendor_payments")

  const { billId } = await searchParams
  const preselectedBillId = billId ? Number(billId) : null

  const [vendors, bills, paymentMethods] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vendorBill.findMany({
      where: { status: { notIn: ["paid", "cancelled"] }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true, vendorId: true, grandTotal: true, balanceDue: true },
    }),
    getActivePaymentMethods(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pembelian", href: "/pembelian" },
  { label: "Pembayaran Vendor", href: "/pembelian/pembayaran-vendor" },
  { label: "Tambah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Pembayaran Vendor</h1>
      </div>
      <VendorPaymentForm
        vendors={vendors}
        bills={JSON.parse(JSON.stringify(bills))}
        paymentMethods={paymentMethods}
        preselectedBillId={preselectedBillId}
      />
    </div>
  )
}
