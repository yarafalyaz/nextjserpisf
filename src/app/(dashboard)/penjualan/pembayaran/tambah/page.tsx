export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PaymentForm } from "@/components/forms/payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getActivePaymentMethods } from "@/lib/services/method.service"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pembayaran" }

export default async function CreatePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string }>
}) {
  await requirePermission("create_sales_payments")
  const params = await searchParams

  const [invoices, accounts, paymentMethods, withholdingTypes] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: ["posted", "partial"] } },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.account.findMany({
      where: { isActive: true, type: "ASSET", code: { startsWith: "1" } },
      orderBy: { code: "asc" },
    }),
    getActivePaymentMethods(),
    // Jenis PPh untuk potongan sisi penjualan (opsional di form).
    prisma.withholdingTaxType.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true, rate: true },
      orderBy: { code: "asc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Pembayaran", href: "/penjualan/pembayaran" },
  { label: "Tambah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Terima Pembayaran</h1>
      </div>
      <PaymentForm
        invoices={JSON.parse(JSON.stringify(invoices))}
        accounts={accounts}
        defaultInvoiceId={params.invoiceId ? Number(params.invoiceId) : undefined}
        paymentMethods={paymentMethods}
        withholdingTypes={withholdingTypes.map((type) => ({ ...type, rate: Number(type.rate) }))}
      />
    </div>
  )
}
