/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteGoodsReceipt } from "@/actions/purchase.actions";
import { PrintButton } from "@/components/ui/print-button";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
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
export const metadata: Metadata = { title: "Penerimaan Barang" };

export default async function GoodsReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("view_purchase_orders");

  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id: numId },
    include: {
      purchaseOrder: { include: { vendor: true, items: true } },
      warehouse: true,
      items: true,
    },
  });

  if (!receipt) notFound();

  // Load warehouses for per-item display
  const warehouses = await prisma.warehouse.findMany({
    select: { id: true, name: true },
  });
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name]));

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Penerimaan Barang", href: "/pembelian/penerimaan" },
          { label: "Detail" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          Penerimaan Barang {receipt.documentNo}
        </h1>
        <div className="flex gap-2 items-center">
          <span className={`status-badge status-${receipt.status}`}>
            {receipt.status}
          </span>
          <div className="flex gap-2">
            <Link
              href={`/pembelian/penerimaan/${receipt.id}/ubah`}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            >
              Ubah
            </Link>
            <PrintButton />
            <DeleteButton id={receipt.id} action={deleteGoodsReceipt} />
            <Link
              href="/pembelian/penerimaan"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all"
            >
              ← Kembali
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              No. Dokumen
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">
              {receipt.documentNo}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pesanan Pembelian
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/pembelian/pesanan/${receipt.purchaseOrder.id}`}>
                {receipt.purchaseOrder.documentNo}
              </Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pemasok
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {receipt.purchaseOrder.vendor ? (
                <Link
                  href={`/master/pemasok/${receipt.purchaseOrder.vendor.id}`}
                >
                  {receipt.purchaseOrder.vendor.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Gudang
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {receipt.warehouse ? (
                <Link href={`/master/gudang/${receipt.warehouse.id}`}>
                  {receipt.warehouse.name}
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
              {formatDate(receipt.date)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Dibuat
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {formatDate(receipt.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Item Diterima
          </h2>
        </div>
        <div className="p-4 px-5">
          {receipt.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              Tidak ada item
            </p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>ID Barang</DetailTableTh>
                <DetailTableTh align="right">Qty Dipesan</DetailTableTh>
                <DetailTableTh align="right">Qty Diterima</DetailTableTh>
                <DetailTableTh align="right">Biaya Satuan</DetailTableTh>
                <DetailTableTh>Gudang</DetailTableTh>
                <DetailTableTh>Mutasi Stok</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {receipt.items.map((item: any) => {
                  const poItem = receipt.purchaseOrder.items?.find(
                    (pi: any) => pi.itemId === item.itemId,
                  );
                  return (
                    <DetailTableRow key={item.id}>
                      <DetailTableTd>{item.itemId}</DetailTableTd>
                      <DetailTableTd align="right">
                        {item.qtyOrdered != null
                          ? Number(item.qtyOrdered)
                          : poItem
                            ? Number(poItem.qty)
                            : "-"}
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {Number(item.qty)}
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {formatCurrency(Number(item.unitCost))}
                      </DetailTableTd>
                      <DetailTableTd>
                        {warehouseMap.get(item.warehouseId) ||
                          receipt.warehouse.name}
                      </DetailTableTd>
                      <DetailTableTd>
                        {item.stockMoveId ? (
                          <Link
                            href={`/inventaris/mutasi-stok?id=${item.stockMoveId}`}
                            className="text-primary hover:underline"
                          >
                            SM-{item.stockMoveId}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </DetailTableTd>
                    </DetailTableRow>
                  );
                })}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>

      {/* Notes */}
      {receipt.notes && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Catatan
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {receipt.notes}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
