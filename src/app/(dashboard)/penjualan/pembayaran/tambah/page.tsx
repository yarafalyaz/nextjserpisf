export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PaymentForm } from "@/components/forms/payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreatePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string }>
}) {
  await requirePermission("create_sales_payments")
  const params = await searchParams

  const [invoices, accounts] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: ["posted", "partial"] } },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.account.findMany({
      where: { isActive: true, type: "ASSET", code: { startsWith: "1" } },
      orderBy: { code: "asc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Sales", href: "/sales" },
  { label: "Payments", href: "/sales/payments" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Terima Pembayaran</h1>
      </div>
      <PaymentForm
        invoices={JSON.parse(JSON.stringify(invoices))}
        accounts={accounts}
        defaultInvoiceId={params.invoiceId ? Number(params.invoiceId) : undefined}
      />
    </div>
  )
}
