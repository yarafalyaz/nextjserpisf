export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { VendorPaymentTable } from "./_components/vendor-payment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function VendorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  await requirePermission("view_vendor_payments")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { documentNo: { contains: params.search } },
        { vendor: { name: { contains: params.search } } },
      ],
    }),
  }

  const rawPayments = await prisma.vendorPayment.findMany({
    where,
    include: { vendor: true },
    orderBy: { createdAt: "desc" },
  })

  const payments = rawPayments.map((p) => ({
    ...p,
    amount: Number(p.amount),
  }))

  const tableData = JSON.parse(JSON.stringify(payments))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Purchase", href: "/pembelian" },
  { label: "Vendor Payments" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pembayaran Vendor</h1>
        <Link href="/pembelian/pembayaran-vendor/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-vpay-btn">
          + Buat Pembayaran
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen atau vendor..." action="/pembelian/pembayaran-vendor" />
        </div>

        <VendorPaymentTable data={tableData} />
      </div>
    </div>
  )
}
