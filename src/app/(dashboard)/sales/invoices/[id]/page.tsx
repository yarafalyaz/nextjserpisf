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
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"

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

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Sales",href:"/sales"},{label:"Invoices",href:"/sales/invoices"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Invoice {invoice.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={invoice.status} />
  <div className="flex gap-2">
          <Link href={`/sales/invoices/${invoice.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          {invoice.status === "paid" && (
            <Link href={`/sales/delivery-orders/create?salesInvoiceId=${invoice.id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-all">+ Delivery Order</Link>
          )}
          <PrintButton />
          <DeleteButton id={invoice.id} action={deleteSalesInvoice} />
                  <Link href="/sales/invoices" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

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
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Customer</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{invoice.customer.name}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(invoice.date)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Jatuh Tempo</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(invoice.dueDate)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Sales Order</span>
                      <span className="text-[0.9375rem] text-foreground font-medium font-mono">{invoice.salesOrder?.documentNo || "-"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Quotation</span>
                      <span className="text-[0.9375rem] text-foreground font-medium font-mono">{invoice.quotation?.documentNo || "-"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Status Bayar</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{invoice.paymentStatus || "-"}</span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {invoice.notes && (
                  <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{invoice.notes}</span>
                    </div>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "items",
            label: "Items",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Items</h2>
                </div>
                <div className="p-4 px-5">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th>Deskripsi</th>
                        <th style={{ textAlign: "right" }}>Qty</th>
                        <th style={{ textAlign: "right" }}>Harga</th>
                        <th style={{ textAlign: "right" }}>Diskon</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.description || `Item #${item.itemId}`}</td>
                          <td className="text-right">{Number(item.qty)}</td>
                          <td className="text-right">{formatCurrency(Number(item.unitPrice))}</td>
                          <td className="text-right">{formatCurrency(Number(item.discount))}</td>
                          <td className="text-right">{formatCurrency(Number(item.total))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="text-right"><strong>Subtotal</strong></td>
                        <td className="text-right"><strong>{formatCurrency(Number(invoice.subtotal))}</strong></td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="text-right">Diskon</td>
                        <td className="text-right">{formatCurrency(Number(invoice.discount))}</td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="text-right">Pajak</td>
                        <td className="text-right">{formatCurrency(Number(invoice.taxAmount))}</td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="text-right"><strong>Grand Total</strong></td>
                        <td className="text-right"><strong>{formatCurrency(Number(invoice.grandTotal))}</strong></td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="text-right text-success">Terbayar</td>
                        <td className="text-right text-success">{formatCurrency(Number(invoice.paidAmount))}</td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="text-right text-danger"><strong>Sisa</strong></td>
                        <td className="text-right text-danger"><strong>{formatCurrency(Number(invoice.grandTotal) - Number(invoice.paidAmount))}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
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
                      <table className="w-full border-collapse">
                        <thead>
                          <tr><th>No. Dokumen</th><th>Tanggal</th><th>Metode</th><th>Status</th><th style={{ textAlign: "right" }}>Nominal</th></tr>
                        </thead>
                        <tbody>
                          {invoice.quotation.downPayments.map((dp: any) => (
                            <tr key={dp.id}>
                              <td className="font-mono">{dp.documentNo}</td>
                              <td>{formatDate(dp.paymentDate)}</td>
                              <td>{dp.paymentMethod || "-"}</td>
                              <td><span className={`status-badge status-${dp.status}`}>{dp.status}</span></td>
                              <td className="text-right">{formatCurrency(Number(dp.amount))}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={4} className="text-right"><strong>Total DP</strong></td>
                            <td className="text-right"><strong>{formatCurrency(invoice.quotation.downPayments.reduce((sum: number, dp: any) => sum + Number(dp.amount), 0))}</strong></td>
                          </tr>
                          <tr>
                            <td colSpan={4} className="text-right">Grand Total Invoice</td>
                            <td className="text-right">{formatCurrency(Number(invoice.grandTotal))}</td>
                          </tr>
                          <tr>
                            <td colSpan={4} className="text-right text-danger"><strong>Sisa Setelah DP</strong></td>
                            <td className="text-right text-danger"><strong>{formatCurrency(Number(invoice.grandTotal) - invoice.quotation.downPayments.reduce((sum: number, dp: any) => sum + Number(dp.amount), 0))}</strong></td>
                          </tr>
                        </tfoot>
                      </table>
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
                    <Link href={`/sales/payments/create?invoiceId=${invoice.id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -primary">+ Terima Bayar</Link>
                  )}
                </div>
                <div className="p-4 px-5">
                  {invoice.payments.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada pembayaran</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Tanggal</th><th>Metode</th><th style={{ textAlign: "right" }}>Jumlah</th></tr>
                      </thead>
                      <tbody>
                        {invoice.payments.map((pay) => (
                          <tr key={pay.id}>
                            <td className="font-mono">{pay.documentNo}</td>
                            <td>{formatDate(pay.paymentDate)}</td>
                            <td>{pay.paymentMethod}</td>
                            <td className="text-right">{formatCurrency(Number(pay.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
