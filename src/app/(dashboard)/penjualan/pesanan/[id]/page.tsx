export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/ui/status-chip";
import { StatusActions } from "@/components/ui/status-actions";
import { PrintButton } from "@/components/ui/print-button";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { InvoiceItemsEditor } from "@/components/ui/invoice-items-editor";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
export const metadata: Metadata = { title: "Pesanan" };

export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("view_sales_orders");

  const { id } = await params;
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const order = await prisma.salesOrder.findUnique({
    where: { id: numId, deletedAt: null },
    include: {
      customer: true,
      quotation: true,
      items: true,
      deliveryOrders: { orderBy: { createdAt: "desc" } },
      salesInvoices: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!order) notFound();

  const itemIds = order.items
    .map((item) => item.itemId)
    .filter((id): id is number => id !== null);

  const dbItems = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, name: true, sku: true },
      })
    : [];

  const itemMap = new Map(dbItems.map((i) => [i.id, i]));

  // Custom fabrication: the order's items stay editable until the customer
  // actually pays. A down payment on a linked invoice is only an advance and
  // does NOT lock the list — only a real (non-DP) payment does.
  const realPaymentCount = await prisma.salesPayment.count({
    where: {
      NOT: { paymentMethod: "down_payment" },
      salesInvoice: { salesOrderId: numId },
    },
  });
  const orderItemsEditable =
    order.status !== "cancelled" && order.status !== "completed" && realPaymentCount === 0;

  // Items selectable in the editor (active catalogue).
  const availableItems = orderItemsEditable
    ? await prisma.item.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          unitOfMeasure: true,
          trackSerial: true,
          uomConversions: { select: { code: true, factorToBase: true } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pesanan Penjualan ${order.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Pesanan", href: "/penjualan/pesanan" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={order.status} />}
        actions={
          <>
            <Button
              href={`/penjualan/pesanan/${order.id}/ubah`}
              variant="primary"
            >
              Ubah
            </Button>
            {order.status === "confirmed" && (
              <Button
                href={`/penjualan/uang-muka/tambah?salesOrderId=${order.id}`}
                variant="primary"
              >
                + Uang Muka
              </Button>
            )}
            <PrintButton documentType="order" documentId={order.id} />
            <BackButton href="/penjualan/pesanan" />
          </>
        }
      />

      {/* Order Info */}
      <StatusActions
        status={order.status}
        id={order.id}
        module="penjualan/pesanan"
      />

      <DetailCard>
        <DetailField
          label="Pelanggan"
          value={
            <Link href={`/master/pelanggan/${order.customerId}`}>
              {order.customer.name}
            </Link>
          }
        />
        <DetailField label="Tanggal" value={formatDate(order.date)} />
        <DetailField
          label="Tanggal Pengiriman"
          value={order.deliveryDate ? formatDate(order.deliveryDate) : "-"}
        />
        <DetailField
          label="Penawaran"
          value={
            order.quotation ? (
              <Link href={`/penjualan/penawaran/${order.quotation.id}`}>
                {order.quotation.documentNo}
              </Link>
            ) : (
              "-"
            )
          }
        />
        <DetailField
          label="Total Keseluruhan"
          value={formatCurrency(Number(order.grandTotal))}
        />
      </DetailCard>

      {/* Items */}
      <InvoiceItemsEditor
        variant="order"
        invoiceId={order.id}
        customerId={order.customerId}
        salesOrderId={order.id}
        quotationId={order.quotationId ?? null}
        date={order.date.toISOString().split("T")[0]}
        taxRate={
          Number(order.subtotal) - Number(order.discount) > 0
            ? Math.round((Number(order.tax) / (Number(order.subtotal) - Number(order.discount))) * 100 * 100) / 100
            : 0
        }
        discountTotal={Number(order.discount ?? 0)}
        items={order.items.map((item) => ({
          id: item.id,
          itemId: item.itemId,
          description: item.description || (item.itemId ? `Item #${item.itemId}` : null),
          qty: Number(item.qty),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount ?? 0),
          total: Number(item.total),
          uom: null,
          serialNumbers: [],
        }))}
        availableItems={availableItems.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          price: Number(i.price ?? 0),
          unitOfMeasure: i.unitOfMeasure,
          trackSerial: i.trackSerial,
          uomConversions: i.uomConversions.map((c) => ({ code: c.code, factorToBase: Number(c.factorToBase) })),
        }))}
        paidAmount={0}
        editable={orderItemsEditable}
      />

      {/* Summary */}
      <DetailCard columns={4}>
        <DetailField
          label="Subtotal"
          value={formatCurrency(Number(order.subtotal))}
        />
        <DetailField
          label="Diskon"
          value={formatCurrency(Number(order.discount))}
        />
        <DetailField label="Pajak" value={formatCurrency(Number(order.tax))} />
        <DetailField
          label="Total Keseluruhan"
          value={
            <span className="text-xl">
              {formatCurrency(Number(order.grandTotal))}
            </span>
          }
        />
      </DetailCard>

      {/* Delivery Orders */}
      {order.deliveryOrders.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              Surat Jalan
            </h2>
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
                    <DetailTableTd className="font-mono">
                      <Link href={`/penjualan/surat-jalan/${d.id}`}>
                        {d.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>{formatDate(d.date)}</DetailTableTd>
                    <DetailTableTd>
                      <StatusChip status={d.status} />
                    </DetailTableTd>
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
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              Faktur
            </h2>
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
                    <DetailTableTd className="font-mono">
                      <Link href={`/penjualan/faktur/${inv.id}`}>
                        {inv.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>{formatDate(inv.date)}</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatCurrency(Number(inv.grandTotal))}
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip status={inv.status} />
                    </DetailTableTd>
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
  );
}
