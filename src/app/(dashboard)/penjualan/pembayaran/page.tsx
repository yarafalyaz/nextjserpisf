export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { PaymentTable } from "./_components/payment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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
    orderBy: { createdAt: "desc" },
  })

  const payments = rawPayments.map((p) => ({
    id: p.id,
    documentNo: p.documentNo,
    salesInvoice: p.salesInvoice,
    paymentDate: p.paymentDate,
    paymentMethod: p.paymentMethod,
    amount: Number(p.amount),
  }))

  const tableData = JSON.parse(JSON.stringify(payments))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Sales", href: "/penjualan" },
  { label: "Payments" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pembayaran Penjualan</h1>
        <Link href="/penjualan/pembayaran/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-payment-btn">
          + Terima Pembayaran
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen atau customer..." action="/penjualan/pembayaran" />
        </div>

        <PaymentTable data={tableData} />
      </div>
    </div>
  )
}
