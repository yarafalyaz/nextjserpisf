export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteDeliveryOrder } from "@/actions/sales.actions";
import { PrintButton } from "@/components/ui/print-button";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityHref, entityEditHref } from "@/lib/utils/entity-url";
import { statusLabel } from "@/lib/utils/status-labels";
import { ProcessButton } from "@/components/ui/process-button";
import { shipDeliveryOrder, deliverDeliveryOrder } from "@/actions/sales.actions";
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table";
export const metadata: Metadata = { title: "Surat Jalan" };

export default async function DeliveryOrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_delivery_orders");

  const { slug } = await params;

  const deliveryOrder = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.deliveryOrder.findFirst({
          where: { slug: s, ...where },
          include: {
            salesOrder: { include: { customer: true } },
            items: { orderBy: { id: "asc" }, include: { item: { select: { name: true, sku: true, unitOfMeasure: true } } } },
          },
        }),
      byId: (id, where) =>
        prisma.deliveryOrder.findUnique({
          where: { id, ...where },
          include: {
            salesOrder: { include: { customer: true } },
            items: { orderBy: { id: "asc" }, include: { item: { select: { name: true, sku: true, unitOfMeasure: true } } } },
          },
        }),
    },
  );

  if (!deliveryOrder) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Surat Jalan", href: "/penjualan/surat-jalan" },
          { label: "Detail" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          Surat Jalan {deliveryOrder.documentNo}
        </h1>
        <div className="flex gap-2 items-center">
          <span className={`status-badge status-${deliveryOrder.status}`}>
            {statusLabel(deliveryOrder.status)}
          </span>
          <div className="flex gap-2">
            <Link
              href={entityEditHref("/penjualan/surat-jalan", deliveryOrder)}
              className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            >
              Ubah
            </Link>
            {/* Transisi status: hanya surat jalan berstatus shipped/delivered yang
                dihitung laporan Pemenuhan Pesanan, jadi tanpa tombol ini semua
                surat jalan tersangkut di konsep dan "terkirim" selalu 0. */}
            {deliveryOrder.status === "draft" && (
              <ProcessButton
                id={deliveryOrder.id}
                action={shipDeliveryOrder}
                label="Tandai Dikirim"
                confirmTitle="Tandai surat jalan ini dikirim?"
                confirmBody="Barang keluar dari gudang dan baris surat jalan mulai dihitung sebagai terkirim di laporan Pemenuhan Pesanan. Setelah dikirim, surat jalan ini tidak bisa dihapus."
                successMessage="Surat jalan ditandai dikirim"
              />
            )}
            {deliveryOrder.status === "shipped" && (
              <ProcessButton
                id={deliveryOrder.id}
                action={deliverDeliveryOrder}
                label="Tandai Terkirim"
                confirmTitle="Tandai surat jalan ini terkirim?"
                confirmBody="Pelanggan sudah menerima barang. Tanggal terkirim dicatat dan baris surat jalan ini tetap dihitung sebagai terkirim di laporan Pemenuhan Pesanan."
                successMessage="Surat jalan ditandai terkirim"
              />
            )}
            <PrintButton documentType="delivery-order" documentId={deliveryOrder.id} />
            <DeleteButton id={deliveryOrder.id} action={deleteDeliveryOrder} />
            <Link
              href="/penjualan/surat-jalan"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all"
            >
              ← Kembali
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              No. Dokumen
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">
              {deliveryOrder.documentNo}
            </span>
          </div>
          {deliveryOrder.doNumber && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                No. DO
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium font-mono">
                {deliveryOrder.doNumber}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pesanan Penjualan
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={entityHref("/penjualan/pesanan", deliveryOrder.salesOrder)}>
                {deliveryOrder.salesOrder.documentNo}
              </Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pelanggan
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {deliveryOrder.salesOrder.customer ? (
                <Link
                  href={entityHref("/master/pelanggan", deliveryOrder.salesOrder.customer)}
                >
                  {deliveryOrder.salesOrder.customer.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tanggal
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {formatDate(deliveryOrder.date)}
            </span>
          </div>
          {deliveryOrder.deliveryDate && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Tanggal Pengiriman
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {formatDate(deliveryOrder.deliveryDate)}
              </span>
            </div>
          )}
          {deliveryOrder.shippingPhone && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Telepon Penerima
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {deliveryOrder.shippingPhone}
              </span>
            </div>
          )}
          {deliveryOrder.vehicleNumber && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                No. Kendaraan
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {deliveryOrder.vehicleNumber}
              </span>
            </div>
          )}
          {deliveryOrder.confirmedBy && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Dikonfirmasi Oleh
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {deliveryOrder.confirmedBy}
              </span>
            </div>
          )}
          {deliveryOrder.confirmedAt && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Dikonfirmasi Pada
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {formatDate(deliveryOrder.confirmedAt)}
              </span>
            </div>
          )}
          {deliveryOrder.deliveredAt && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Dikirim Pada
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {formatDate(deliveryOrder.deliveredAt)}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Dibuat
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {formatDate(deliveryOrder.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Barang yang dikirim */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang Dikirim</h2>
        </div>
        <div className="p-4 px-5">
          {deliveryOrder.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Surat jalan ini belum punya baris barang, jadi belum ikut menghitung pemenuhan pesanan.
            </p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Barang</DetailTableTh>
                <DetailTableTh>SKU</DetailTableTh>
                <DetailTableTh align="right">Jumlah</DetailTableTh>
                <DetailTableTh>Satuan</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {deliveryOrder.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>{item.item.name}</DetailTableTd>
                    <DetailTableTd className="font-mono">{item.item.sku}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                    <DetailTableTd>{item.item.unitOfMeasure}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>

      {/* Notes */}
      {deliveryOrder.notes && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Catatan
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {deliveryOrder.notes}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
