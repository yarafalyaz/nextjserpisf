export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteSalesInvoice } from "@/actions/sales.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { InvoiceItemsEditor } from "@/components/ui/invoice-items-editor"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd, DetailTableFoot, DetailTableFootRow } from "@/components/ui/detail-table"

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_sales_invoices")
  const { id } = await params

  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      salesOrder: true,
      quotation: { include: { downPayments: { orderBy: { paymentDate: "asc" } } } },
      items: true,
      payments: true,
    },
  })

  if (!invoice) notFound()

  // Fetch available items for the editor
  const availableItems = await prisma.item.findMany({
    where: { isActive: true },
    select: { id: true, name: true, sku: true, price: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Invoice ${invoice.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Sales", href: "/sales" },
          { label: "Invoices", href: "/sales/invoices" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={invoice.status} />}
        actions={
          <>
            <Button href={`/sales/invoices/${invoice.id}/edit`} variant="primary">Edit</Button>
            {invoice.status === "paid" && (
              <Button href={`/sales/delivery-orders/create?salesInvoiceId=${invoice.id}`} variant="primary">+ Delivery Order</Button>
            )}
            <PrintButton documentType="invoice" documentId={invoice.id} />
            <DeleteButton id={invoice.id} action={deleteSalesInvoice} />
            <BackButton href="/sales/invoices" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Invoice detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <StatusActions
                  status={invoice.status}
                  id={invoice.id}
                  module="sales/invoices"
                />
                <DetailCard>
                  <DetailField label="Customer" value={invoice.customer.name} />
                  <DetailField label="Tanggal" value={formatDate(invoice.date)} />
                  <DetailField label="Jatuh Tempo" value={formatDate(invoice.dueDate)} />
                  <DetailField label="Sales Order" value={invoice.salesOrder?.documentNo || "-"} mono />
                  <DetailField label="Quotation" value={invoice.quotation?.documentNo || "-"} mono />
                  <DetailField label="Status Bayar" value={invoice.paymentStatus || "-"} />
                </DetailCard>

                {/* Notes */}
                {invoice.notes && (
                  <DetailCard>
                    <DetailField label="Catatan" value={invoice.notes} colSpan="full" />
                  </DetailCard>
                )}
              </>
            ),
          },
          {
            id: "items",
            label: "Items",
            content: (
              <InvoiceItemsEditor
                invoiceId={invoice.id}
                customerId={invoice.customerId}
                salesOrderId={invoice.salesOrderId}
                quotationId={invoice.quotationId}
                date={invoice.date.toISOString().split("T")[0]}
                dueDate={invoice.dueDate?.toISOString().split("T")[0]}
                taxRate={Number(invoice.tax ?? 0)}
                discountTotal={Number(invoice.discount ?? 0)}
                items={invoice.items.map((item) => ({
                  id: item.id,
                  itemId: item.itemId,
                  description: item.description || `Item #${item.itemId}`,
                  qty: Number(item.qty),
                  unitPrice: Number(item.unitPrice),
                  discount: Number(item.discount ?? 0),
                  total: Number(item.total),
                }))}
                availableItems={availableItems.map((i) => ({ id: i.id, name: i.name, sku: i.sku, price: Number(i.price ?? 0) }))}
                paidAmount={Number(invoice.paidAmount ?? 0)}
                editable={invoice.status !== "paid" && invoice.status !== "cancelled"}
              />
            ),
          },
          {
            id: "down-payment",
            label: "Down Payment",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Down Payment</h2>
                </div>
                <div className="p-4 px-5">
                  {(!invoice.quotation?.downPayments || invoice.quotation.downPayments.length === 0) ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada down payment</p>
                  ) : (
                    <>
                      <DetailTable>
                        <DetailTableHead>
                          <DetailTableTh>No. Dokumen</DetailTableTh>
                          <DetailTableTh>Tanggal</DetailTableTh>
                          <DetailTableTh>Metode</DetailTableTh>
                          <DetailTableTh>Status</DetailTableTh>
                          <DetailTableTh align="right">Nominal</DetailTableTh>
                        </DetailTableHead>
                        <DetailTableBody>
                          {invoice.quotation.downPayments.map((dp: any) => (
                            <DetailTableRow key={dp.id}>
                              <DetailTableTd className="font-mono">{dp.documentNo}</DetailTableTd>
                              <DetailTableTd>{formatDate(dp.paymentDate)}</DetailTableTd>
                              <DetailTableTd>{dp.paymentMethod || "-"}</DetailTableTd>
                              <DetailTableTd><StatusChip status={dp.status} /></DetailTableTd>
                              <DetailTableTd align="right">{formatCurrency(Number(dp.amount))}</DetailTableTd>
                            </DetailTableRow>
                          ))}
                        </DetailTableBody>
                        <DetailTableFoot>
                          <DetailTableFootRow>
                            <DetailTableTd colSpan={4} align="right" className="font-bold">Total DP</DetailTableTd>
                            <DetailTableTd align="right" className="font-bold">{formatCurrency(invoice.quotation.downPayments.reduce((sum: number, dp: any) => sum + Number(dp.amount), 0))}</DetailTableTd>
                          </DetailTableFootRow>
                          <DetailTableFootRow>
                            <DetailTableTd colSpan={4} align="right">Grand Total Invoice</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(invoice.grandTotal))}</DetailTableTd>
                          </DetailTableFootRow>
                          <DetailTableFootRow>
                            <DetailTableTd colSpan={4} align="right" className="text-danger font-bold">Sisa Setelah DP</DetailTableTd>
                            <DetailTableTd align="right" className="text-danger font-bold">{formatCurrency(Number(invoice.grandTotal) - invoice.quotation.downPayments.reduce((sum: number, dp: any) => sum + Number(dp.amount), 0))}</DetailTableTd>
                          </DetailTableFootRow>
                        </DetailTableFoot>
                      </DetailTable>
                    </>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "pembayaran",
            label: "Pembayaran",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Pembayaran</h2>
                  {(invoice.status === "posted" || invoice.status === "partial") && (
                    <Link href={`/sales/payments/create?invoiceId=${invoice.id}`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">+ Terima Bayar</Link>
                  )}
                </div>
                <div className="p-4 px-5">
                  {invoice.payments.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada pembayaran</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>Metode</DetailTableTh>
                        <DetailTableTh align="right">Jumlah</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {invoice.payments.map((pay) => (
                          <DetailTableRow key={pay.id}>
                            <DetailTableTd className="font-mono">{pay.documentNo}</DetailTableTd>
                            <DetailTableTd>{formatDate(pay.paymentDate)}</DetailTableTd>
                            <DetailTableTd>{pay.paymentMethod}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(pay.amount))}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "lampiran",
            label: "Lampiran",
            content: (
              <TransactionAttachments referenceType="sales_invoice" referenceId={invoice.id} />
            ),
          },
        ]}
      />
    </div>
  )
}
