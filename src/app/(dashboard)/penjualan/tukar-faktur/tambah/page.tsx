export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { InvoiceExchangeForm, type ExchangeableInvoice } from "../_components/invoice-exchange-form"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { isSettled } from "@/lib/finance/settlement-status"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Tukar Faktur" }

export default async function CreateInvoiceExchangePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermission("create_invoice_exchanges")

  const params = await searchParams
  const customerId = Number(params.customer)
  const validCustomerId = Number.isInteger(customerId) && customerId > 0 ? customerId : null

  const customers = await prisma.customer.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  let invoices: ExchangeableInvoice[] = []
  if (validCustomerId) {
    const [candidates, alreadyExchanged] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: {
          customerId: validCustomerId,
          deletedAt: null,
          status: { in: ["posted", "partial"] },
        },
        orderBy: { date: "asc" },
        select: { id: true, documentNo: true, date: true, grandTotal: true, paidAmount: true },
      }),
      prisma.invoiceExchangeItem.findMany({
        where: { exchange: { deletedAt: null } },
        select: { salesInvoiceId: true },
      }),
    ])

    const exchanged = new Set(alreadyExchanged.map((item) => item.salesInvoiceId))
    invoices = candidates
      // Belum lunas FIN-BR-006 (sisa <= Rp1 = lunas, tidak masuk kandidat) dan
      // belum pernah diserahkan.
      .filter((invoice) => !isSettled(invoice.grandTotal, invoice.paidAmount))
      .filter((invoice) => !exchanged.has(invoice.id))
      .map((invoice) => ({
        id: invoice.id,
        documentNo: salesInvoiceLabel(invoice),
        date: invoice.date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
        grandTotal: Number(invoice.grandTotal),
        paidAmount: Number(invoice.paidAmount),
      }))
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Tukar Faktur", href: "/penjualan/tukar-faktur" },
          { label: "Tambah" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Tambah Tukar Faktur</h1>
      <InvoiceExchangeForm
        customerOptions={customers.map((customer) => ({ value: String(customer.id), label: customer.name }))}
        customerId={validCustomerId ? String(validCustomerId) : ""}
        invoices={invoices}
      />
    </div>
  )
}
