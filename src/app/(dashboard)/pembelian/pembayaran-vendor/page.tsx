export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { VendorPaymentTable } from "./_components/vendor-payment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getPaymentMethodMap, resolvePaymentMethodName } from "@/lib/services/method.service"

export default async function VendorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_vendor_payments")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { vendor: { name: { contains: params.cari } } },
      ],
    }),
  }

  const rawPayments = await prisma.vendorPayment.findMany({
    where,
    include: { vendor: true },
    take: 1000,
    orderBy: { createdAt: "desc" },
  })

  const pmMap = await getPaymentMethodMap()
  const payments = rawPayments.map((p) => ({
    ...p,
    amount: Number(p.amount),
    paymentMethod: resolvePaymentMethodName(p.paymentMethod, pmMap),
  }))

  const tableData = JSON.parse(JSON.stringify(payments))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pembelian", href: "/pembelian" },
  { label: "Pembayaran Vendor" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pembayaran Vendor</h1>
        <Link href="/pembelian/pembayaran-vendor/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-vpay-btn">
          + Buat Pembayaran
        </Link>
      </div>

      <VendorPaymentTable data={tableData} />
    </div>
  )
}
