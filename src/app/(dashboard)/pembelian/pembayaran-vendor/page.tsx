export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { VendorPaymentTable } from "./_components/vendor-payment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getPaymentMethodMap, resolvePaymentMethodName } from "@/lib/services/method.service"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pembayaran Pemasok" }

export default async function VendorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_vendor_payments")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

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
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const pmMap = await getPaymentMethodMap()
  const payments = rawPayments.map((p) => ({
    ...p,
    amount: Number(p.amount),
    paymentMethod: resolvePaymentMethodName(p.paymentMethod, pmMap),
  }))

  const total = await prisma.vendorPayment.count({ where })

  const tableData = toPlain(payments)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pembelian", href: "/pembelian" },
  { label: "Pembayaran Pemasok" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pembayaran Pemasok</h1>
        <CanCreate permission="create_vendor_payments">
          <Link href="/pembelian/pembayaran-vendor/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-vpay-btn">
            + Buat Pembayaran
          </Link>
        </CanCreate>
      </div>

      <VendorPaymentTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
