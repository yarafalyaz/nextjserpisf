export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Plus } from "@/components/ui/fontawesome-icons"
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

  const [rawPayments, pmMap, total] = await Promise.all([
    prisma.salesPayment.findMany({
      where,
      include: { salesInvoice: { include: { customer: true } } },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    getPaymentMethodMap(),
    prisma.salesPayment.count({ where }),
  ])
  const payments = rawPayments.map((p) => ({
    id: p.id,
    slug: p.slug,
    documentNo: p.documentNo,
    salesInvoice: { ...p.salesInvoice, documentNo: salesInvoiceLabel(p.salesInvoice) },
    paymentDate: p.paymentDate,
    paymentMethod: resolvePaymentMethodName(p.paymentMethod, pmMap),
    amount: Number(p.amount),
  }))

  const tableData = toPlain(payments)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Pembayaran" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Penerimaan Pembayaran Penjualan
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pencatatan setoran piutang pelanggan, pelunasan faktur, dan rekonsiliasi akun kas/bank penerima.
          </p>
        </div>
        <CanCreate permission="create_sales_payments">
          <Link
            href="/penjualan/pembayaran/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-payment-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Terima Pembayaran</span>
          </Link>
        </CanCreate>
      </div>

      <PaymentTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
