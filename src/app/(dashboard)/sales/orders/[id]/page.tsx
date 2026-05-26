export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const order = await prisma.salesOrder.findUnique({
    where: { id: Number(id), deletedAt: null },
    include: {
      customer: true,
      quotation: true,
      items: true,
      deliveryOrders: { orderBy: { createdAt: "desc" } },
      salesInvoices: { orderBy: { createdAt: "desc" } },
    },
  })

  if (!order) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Sales",href:"/sales"},{label:"Orders",href:"/sales/orders"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Sales Order {order.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className={`status-badge status-${order.status}`}>{order.status}</span>
  <div className="flex gap-2">
          <Link href={`/sales/orders/${order.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          {order.status === "approved" && (
            <Link href={`/sales/down-payments/create?salesOrderId=${order.id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-all">+ Down Payment</Link>
          )}
          <PrintButton />
                  <Link href="/sales/orders" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      {/* Order Info */}
      <StatusActions
        status={order.status}
        id={order.id}
        module="sales/orders"
      />
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Customer</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/master/customers/${order.customerId}`}>{order.customer.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(order.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Pengiriman</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{order.deliveryDate ? formatDate(order.deliveryDate) : "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Quotation</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {order.quotation ? (
                <Link href={`/sales/quotations/${order.quotation.id}`}>{order.quotation.documentNo}</Link>
              ) : "-"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Grand Total</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(order.grandTotal))}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item</h2>
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
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description || "-"}</td>
                  <td className="text-right">{Number(item.qty)}</td>
                  <td className="text-right">{formatCurrency(Number(item.unitPrice))}</td>
                  <td className="text-right">{formatCurrency(Number(item.discount))}</td>
                  <td className="text-right">{formatCurrency(Number(item.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Subtotal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(order.subtotal))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Diskon</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(order.discount))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Pajak</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(order.tax))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Grand Total</span>
            <span className="text-[0.9375rem] text-foreground font-medium" style={{ fontSize: "1.25rem" }}>{formatCurrency(Number(order.grandTotal))}</span>
          </div>
        </div>
      </div>

      {/* Delivery Orders */}
      {order.deliveryOrders.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Surat Jalan</h2>
          </div>
          <div className="p-4 px-5">
            <table className="w-full border-collapse">
              <thead>
                <tr><th>No. Dokumen</th><th>Tanggal</th><th>Status</th></tr>
              </thead>
              <tbody>
                {order.deliveryOrders.map((d) => (
                  <tr key={d.id}>
                    <td className="font-mono"><Link href={`/sales/delivery-orders/${d.id}`}>{d.documentNo}</Link></td>
                    <td>{formatDate(d.date)}</td>
                    <td><span className={`status-badge status-${d.status}`}>{d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoices */}
      {order.salesInvoices.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Invoice</h2>
          </div>
          <div className="p-4 px-5">
            <table className="w-full border-collapse">
              <thead>
                <tr><th>No. Dokumen</th><th>Tanggal</th><th>Total</th><th>Status</th></tr>
              </thead>
              <tbody>
                {order.salesInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-mono"><Link href={`/sales/invoices/${inv.id}`}>{inv.documentNo}</Link></td>
                    <td>{formatDate(inv.date)}</td>
                    <td className="text-right">{formatCurrency(Number(inv.grandTotal))}</td>
                    <td><span className={`status-badge status-${inv.status}`}>{inv.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{order.notes}</span>
          </div>
        </div>
      )}
    </div>
  )
}
