export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

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
      <PageHeader
        title={`Sales Order ${order.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Sales", href: "/sales" },
          { label: "Orders", href: "/sales/orders" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={order.status} />}
        actions={
          <>
            <Button href={`/sales/orders/${order.id}/edit`} variant="primary">Edit</Button>
            {order.status === "approved" && (
              <Button href={`/sales/down-payments/create?salesOrderId=${order.id}`} variant="primary">+ Down Payment</Button>
            )}
            <PrintButton />
            <BackButton href="/sales/orders" />
          </>
        }
      />

      {/* Order Info */}
      <StatusActions
        status={order.status}
        id={order.id}
        module="sales/orders"
      />

      <DetailCard>
        <DetailField
          label="Customer"
          value={<Link href={`/master/customers/${order.customerId}`}>{order.customer.name}</Link>}
        />
        <DetailField label="Tanggal" value={formatDate(order.date)} />
        <DetailField label="Tanggal Pengiriman" value={order.deliveryDate ? formatDate(order.deliveryDate) : "-"} />
        <DetailField
          label="Quotation"
          value={order.quotation ? <Link href={`/sales/quotations/${order.quotation.id}`}>{order.quotation.documentNo}</Link> : "-"}
        />
        <DetailField label="Grand Total" value={formatCurrency(Number(order.grandTotal))} />
      </DetailCard>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Deskripsi</DetailTableTh>
              <DetailTableTh align="right">Qty</DetailTableTh>
              <DetailTableTh align="right">Harga</DetailTableTh>
              <DetailTableTh align="right">Diskon</DetailTableTh>
              <DetailTableTh align="right">Total</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {order.items.map((item) => (
                <DetailTableRow key={item.id}>
                  <DetailTableTd>{item.description || "-"}</DetailTableTd>
                  <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(Number(item.unitPrice))}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(Number(item.discount))}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(Number(item.total))}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Summary */}
      <DetailCard columns={4}>
        <DetailField label="Subtotal" value={formatCurrency(Number(order.subtotal))} />
        <DetailField label="Diskon" value={formatCurrency(Number(order.discount))} />
        <DetailField label="Pajak" value={formatCurrency(Number(order.tax))} />
        <DetailField label="Grand Total" value={<span className="text-xl">{formatCurrency(Number(order.grandTotal))}</span>} />
      </DetailCard>

      {/* Delivery Orders */}
      {order.deliveryOrders.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Surat Jalan</h2>
          </div>
          <div className="p-4 px-5">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Dokumen</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {order.deliveryOrders.map((d) => (
                  <DetailTableRow key={d.id}>
                    <DetailTableTd className="font-mono"><Link href={`/sales/delivery-orders/${d.id}`}>{d.documentNo}</Link></DetailTableTd>
                    <DetailTableTd>{formatDate(d.date)}</DetailTableTd>
                    <DetailTableTd><StatusChip status={d.status} /></DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
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
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Dokumen</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh align="right">Total</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {order.salesInvoices.map((inv) => (
                  <DetailTableRow key={inv.id}>
                    <DetailTableTd className="font-mono"><Link href={`/sales/invoices/${inv.id}`}>{inv.documentNo}</Link></DetailTableTd>
                    <DetailTableTd>{formatDate(inv.date)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(inv.grandTotal))}</DetailTableTd>
                    <DetailTableTd><StatusChip status={inv.status} /></DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={order.notes} colSpan="full" />
        </DetailCard>
      )}
    </div>
  )
}
