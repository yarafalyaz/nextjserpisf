export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { PaymentTable } from "./_components/payment-table"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getPaymentMethodMap, resolvePaymentMethodName } from "@/lib/services/method.service"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pembayaran" }

export default async function SalesPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_sales_payments")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

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
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const pmMap = await getPaymentMethodMap()
  const payments = rawPayments.map((p) => ({
    id: p.id,
    slug: p.slug,
    documentNo: p.documentNo,
    status: p.status,
    salesInvoice: { ...p.salesInvoice, documentNo: salesInvoiceLabel(p.salesInvoice) },
    paymentDate: p.paymentDate,
    paymentMethod: resolvePaymentMethodName(p.paymentMethod, pmMap),
    amount: Number(p.amount),
  }))

  const total = await prisma.salesPayment.count({ where })

  const tableData = toPlain(payments)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Pembayaran" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pembayaran Penjualan</h1>
        <CanCreate permission="create_sales_payments">
          <Link href="/penjualan/pembayaran/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-payment-btn">
            + Terima Pembayaran
          </Link>
        </CanCreate>
      </div>

      <PaymentTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
