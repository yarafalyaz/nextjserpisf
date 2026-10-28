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
import { DELIVERABLE_ORDER_STATUSES } from "@/lib/validations/sales.schemas";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceItemsEditor } from "@/components/ui/invoice-items-editor";
import { LockedDocNotice } from "@/components/ui/locked-edit-guard";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";

import type { Metadata } from "next";

import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityHref, entityEditHref } from "@/lib/utils/entity-url";
export const metadata: Metadata = { title: "Pesanan" };

export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_sales_orders");
  const canApprove = await hasPermission("approve_sales_orders");

  const { slug } = await params;

  const order = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) =>
        prisma.salesOrder.findFirst({
          where: { slug: s, ...where },
          include: {
            customer: true,
            quotation: true,
            items: true,
            deliveryOrders: { orderBy: { createdAt: "desc" } },
            salesInvoices: { orderBy: { createdAt: "desc" } },
          },
        }),
      byId: (id, where) =>
        prisma.salesOrder.findUnique({
          where: { id, ...where },
          include: {
            customer: true,
            quotation: true,
            items: true,
            deliveryOrders: { orderBy: { createdAt: "desc" } },
            salesInvoices: { orderBy: { createdAt: "desc" } },
          },
        }),
    },
  );

  if (!order) notFound();

  const itemIds = order.items
    .map((item) => item.itemId)
    .filter((id): id is number => id !== null);

  const dbItems = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, name: true },
      })
    : [];

  // Lookup so an order line with no free-text description still shows the
  // catalogue item NAME instead of a bare "Item #<id>".
  const itemMap = new Map(dbItems.map((i) => [i.id, i]));

  // Custom fabrication: the order's items stay editable until the customer
  // actually pays. A down payment on a linked invoice is only an advance and
  // does NOT lock the list — only a real (non-DP) payment does.
  const realPaymentCount = await prisma.salesPayment.count({
    where: {
      NOT: { paymentMethod: "down_payment" },
      salesInvoice: { salesOrderId: order.id },
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
            {/* GL-BR-003 K1: cermin guard server updateSalesOrder
                (cancelled/completed/setelah-pelunasan-nyata pasti ditolak).
                posted tanpa pelunasan nyata tetap boleh Ubah. */}
            {orderItemsEditable && (
              <Button
                href={entityEditHref("/penjualan/pesanan", order)}
                variant="primary"
              >
                Ubah
              </Button>
            )}
            {order.quotationId && order.status !== "cancelled" && (
              <Button
                href={`/penjualan/uang-muka/tambah/pesanan/${order.slug ?? order.id}`}
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

      {/* GL-BR-003 K2: pesanan terkunci (cancelled/completed/pelunasan
          nyata) — koreksi via retur/void faktur turunan, bukan edit
          pesanan. */}
      {!orderItemsEditable && (
        <LockedDocNotice kind="pesanan" documentNo={order.documentNo} />
      )}

      {/* Order Info */}
      <StatusActions
        status={order.status}
        id={order.id}
        module="penjualan/pesanan"
        canAct={canApprove}
      />

      <DetailCard>
        <DetailField
          label="Pelanggan"
          value={
            <Link href={entityHref("/master/pelanggan", order.customer)}>
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
              <Link href={entityHref("/penjualan/penawaran", order.quotation)}>
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
          // Show the catalogue item name (looked up above); fall back to a
          // generic label only when the item was deleted / has no master row.
          description:
            item.description ||
            (item.itemId ? itemMap.get(item.itemId)?.name ?? `Barang #${item.itemId}` : null),
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

      {/* Surat Jalan yang lahir dari pesanan ini. Kartunya SELALU tampil (dengan
          keadaan kosong) supaya jalan membuat surat jalan terlihat dari sini:
          dulu kartunya hilang sama sekali saat belum ada surat jalan, sehingga
          satu-satunya jalan adalah menu Surat Jalan dan tautannya tidak ada. */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Surat Jalan</h2>
          {DELIVERABLE_ORDER_STATUSES.includes(
            order.status as (typeof DELIVERABLE_ORDER_STATUSES)[number]
          ) && (
            <Button
              href={`/penjualan/surat-jalan/tambah/pesanan/${order.slug ?? order.id}`}
              variant="primary"
            >
              + Surat Jalan
            </Button>
          )}
        </div>
        <div className="p-4 px-5">
          {order.deliveryOrders.length === 0 ? (
            <EmptyState title="Belum ada surat jalan untuk pesanan ini" />
          ) : (
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
                      <Link href={entityHref("/penjualan/surat-jalan", d)}>
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
          )}
        </div>
      </div>

      {/* Faktur yang lahir dari pesanan ini. Kartunya SELALU tampil (dengan
          keadaan kosong) supaya jalan membuat faktur terlihat dari sini —
          tanpa ini pengguna harus menebak lewat menu, persis celah kartu Surat
          Jalan yang sudah ditutup di atas. */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Faktur
          </h2>
          {DELIVERABLE_ORDER_STATUSES.includes(
            order.status as (typeof DELIVERABLE_ORDER_STATUSES)[number]
          ) && (
            <Button
              href={`/penjualan/faktur/tambah/pesanan/${order.slug ?? order.id}`}
              variant="primary"
            >
              + Faktur
            </Button>
          )}
        </div>
        <div className="p-4 px-5">
          {order.salesInvoices.length === 0 ? (
            <EmptyState title="Belum ada faktur untuk pesanan ini" />
          ) : (
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
                      <Link href={entityHref("/penjualan/faktur", inv)}>
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
          )}
        </div>
      </div>

      {/* Notes */}
      {order.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={order.notes} colSpan="full" />
        </DetailCard>
      )}
    </div>
  );
}
