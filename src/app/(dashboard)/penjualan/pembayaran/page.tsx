export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { PaymentTable } from "./_components/payment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getPaymentMethodMap, resolvePaymentMethodName } from "@/lib/services/method.service"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pembayaran" }

export default async function SalesPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_sales_payments")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { salesInvoice: { customer: { name: { contains: params.cari } } } },
      ],
    }),
  }

  const rawPayments = await prisma.salesPayment.findMany({
    where,
    include: { salesInvoice: { include: { customer: true } } },
    take: 1000,
    orderBy: { createdAt: "desc" },
  })

  const pmMap = await getPaymentMethodMap()
  const payments = rawPayments.map((p) => ({
    id: p.id,
    documentNo: p.documentNo,
    salesInvoice: p.salesInvoice,
    paymentDate: p.paymentDate,
    paymentMethod: resolvePaymentMethodName(p.paymentMethod, pmMap),
    amount: Number(p.amount),
  }))

  const tableData = JSON.parse(JSON.stringify(payments))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Pembayaran" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pembayaran Penjualan</h1>
        <Link href="/penjualan/pembayaran/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-payment-btn">
          + Terima Pembayaran
        </Link>
      </div>

      <PaymentTable data={tableData} />
    </div>
  )
}
