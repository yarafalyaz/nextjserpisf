import { Plus } from "@/components/ui/fontawesome-icons";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Tukar Faktur Penjualan (Invoice Exchange)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Penyerahan faktur penjualan ke pelanggan dan penerimaan tanda terima, sebagai dasar jatuh tempo dan pemantauan pelunasan piutang.
          </p>
        </div>
        <CanCreate permission="create_invoice_exchanges">
          <Link
            href="/penjualan/tukar-faktur/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-invoice-exchange-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Tukar Faktur</span>
          </Link>
        </CanCreate>
      </div>

      <InvoiceExchangeTable data={rows} />
    </div>
  )
}
