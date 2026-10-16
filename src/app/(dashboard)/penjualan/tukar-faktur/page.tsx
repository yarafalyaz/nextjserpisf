export const dynamic = "force-dynamic"

import Link from "next/link"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { InvoiceExchangeTable } from "./_components/invoice-exchange-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tukar Faktur" }

export default async function InvoiceExchangesPage() {
  await requirePermission("view_invoice_exchanges")

  const exchanges = await prisma.invoiceExchange.findMany({
    where: { deletedAt: null },
    orderBy: { date: "desc" },
    take: 200,
    include: {
      customer: { select: { name: true } },
      items: { select: { salesInvoice: { select: { grandTotal: true, paidAmount: true } } } },
    },
  })

  const rows = exchanges.map((exchange) => {
    const amount = exchange.items.reduce((sum, item) => sum + Number(item.salesInvoice.grandTotal), 0)
    const paid = exchange.items.reduce((sum, item) => sum + Number(item.salesInvoice.paidAmount), 0)
    return {
      id: exchange.id,
      documentNo: exchange.documentNo,
      date: exchange.date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
      customerName: exchange.customer.name,
      receiptNumber: exchange.receiptNumber,
      dueDate: exchange.dueDate
        ? exchange.dueDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
        : null,
      invoiceCount: exchange.items.length,
      amount,
      paid,
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Tukar Faktur" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tukar Faktur</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Penyerahan faktur penjualan ke pelanggan dan penerimaan tanda terima, sebagai dasar jatuh
            tempo dan pemantauan pelunasan. Tidak membuat jurnal.
          </p>
        </div>
        <CanCreate permission="create_invoice_exchanges">
          <Link
            href="/penjualan/tukar-faktur/tambah"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover"
            id="create-invoice-exchange-btn"
          >
            + Tambah Tukar Faktur
          </Link>
        </CanCreate>
      </div>

      <InvoiceExchangeTable data={rows} />
    </div>
  )
}
