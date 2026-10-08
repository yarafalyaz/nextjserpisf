 
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteGoodsReceipt, verifyGoodsReceipt } from "@/actions/purchase.actions";
import { PrintButton } from "@/components/ui/print-button";
import { ProcessButton } from "@/components/ui/process-button";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
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
  await requirePermission("view_goods_receipts");

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
  const [warehouses, racks, rackRows, receiptItems] = await Promise.all([
    prisma.warehouse.findMany({
      select: { id: true, name: true },
    }),
    prisma.rack.findMany({ select: { id: true, name: true, code: true } }),
    prisma.rackRow.findMany({ select: { id: true, name: true, code: true } }),
    prisma.item.findMany({
      where: { id: { in: receipt.items.map((i) => i.itemId) } },
      select: { id: true, name: true, sku: true, unitOfMeasure: true },
    }),
  ]);
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name]));
  const rackMap = new Map(racks.map((r) => [r.id, r]));
  const rackRowMap = new Map(rackRows.map((rr) => [rr.id, rr]));
  const itemMap = new Map(receiptItems.map((i) => [i.id, i]));

  // The GL journal posted when this receipt was verified (Dr Persediaan /
  // Cr clearing). Rendered as a link so users can jump from the receipt to the
  // books — a receipt stuck in draft has none.
  const journal = await prisma.journal.findFirst({
    where: { referenceType: "GoodsReceipt", referenceId: numId },
    select: { id: true, journalNumber: true, totalDebit: true, status: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Penerimaan Barang ${receipt.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Penerimaan Barang", href: "/pembelian/penerimaan" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={receipt.status} />}
        actions={
          <>
            {receipt.status === "draft" && (
              <>
                <ProcessButton
                  id={receipt.id}
                  action={verifyGoodsReceipt}
                  confirmTitle="Verifikasi penerimaan barang ini?"
                  confirmBody="Verifikasi akan menambah stok ke gudang, membuat mutasi stok, dan mencatat nilai HPP. Pastikan jumlah, lokasi rak/baris, dan harga sudah benar."
                  successMessage="Penerimaan barang berhasil diverifikasi"
                  label="Verifikasi"
                />
                <Link
                  href={`/pembelian/penerimaan/${receipt.id}/ubah`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
                >
                  Ubah
                </Link>
                <DeleteButton id={receipt.id} action={deleteGoodsReceipt} />
              </>
            )}
            <PrintButton />
            <BackButton href="/pembelian/penerimaan" />
          </>
        }
      />

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
              Vendor
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {receipt.purchaseOrder.vendor ? (
                <Link
                  href={`/master/vendor/${receipt.purchaseOrder.vendor.id}`}
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
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Ongkir Aktual
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {Number(receipt.shippingCost) > 0 ? (
                formatCurrency(Number(receipt.shippingCost))
              ) : (
                <span className="text-muted-foreground">
                  Pakai estimasi PO
                </span>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Biaya Lain
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {formatCurrency(Number(receipt.otherCost))}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Admin Bank
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {formatCurrency(Number(receipt.adminFee))}
            </span>
          </div>
        </div>
      </div>

      {/* Landed-cost breakdown — the freight the PO estimated and the discount
          that reduce HPP. Only shown when the PO carries any. */}
      {(Number(receipt.purchaseOrder.shippingCost) > 0 ||
        Number(receipt.purchaseOrder.serviceFee) > 0 ||
        Number(receipt.purchaseOrder.discount) > 0) && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <h2 className="mb-4 text-[0.9375rem] font-semibold text-foreground">
            Komponen Landed Cost (estimasi PO)
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ongkir (PO)
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {formatCurrency(Number(receipt.purchaseOrder.shippingCost))}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Biaya Layanan (PO)
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {formatCurrency(Number(receipt.purchaseOrder.serviceFee))}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Diskon Nota (PO)
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                − {formatCurrency(Number(receipt.purchaseOrder.discount))}
              </span>
            </div>
          </div>
        </div>
      )}

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
                <DetailTableTh>Barang</DetailTableTh>
                <DetailTableTh align="right">Qty Dipesan</DetailTableTh>
                <DetailTableTh align="right">Qty Diterima</DetailTableTh>
                <DetailTableTh align="right">Biaya Satuan</DetailTableTh>
                <DetailTableTh>Gudang</DetailTableTh>
                <DetailTableTh>Rak / Baris</DetailTableTh>
                <DetailTableTh>Mutasi Stok</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {receipt.items.map((item: any) => {
                  const poItem = receipt.purchaseOrder.items?.find(
                    (pi: any) => pi.itemId === item.itemId,
                  );
                  const master = itemMap.get(item.itemId);
                  return (
                    <DetailTableRow key={item.id}>
                      <DetailTableTd>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground">
                            {master?.name ?? `Barang #${item.itemId}`}
                          </span>
                          {master?.sku && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {master.sku}
                            </span>
                          )}
                        </div>
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {Number(item.qtyOrdered) > 0
                          ? Number(item.qtyOrdered)
                          : poItem
                            ? Number(poItem.qty)
                            : "-"}
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {Number(item.qty)}
                        {item.uom ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {item.uom}
                          </span>
                        ) : null}
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {formatCurrency(Number(item.unitCost))}
                      </DetailTableTd>
                      <DetailTableTd>
                        {warehouseMap.get(item.warehouseId) ||
                          receipt.warehouse.name}
                      </DetailTableTd>
                      <DetailTableTd>
                        {(() => {
                          const rack = item.rackId ? rackMap.get(item.rackId) : null;
                          const row = item.rackRowId ? rackRowMap.get(item.rackRowId) : null;
                          const rackLabel = rack ? (rack.code ? `${rack.code} — ${rack.name}` : rack.name) : null;
                          const rowLabel = row ? (row.code ? `${row.code} — ${row.name}` : row.name) : null;
                          if (!rackLabel && !rowLabel) return "-";
                          return [rackLabel, rowLabel].filter(Boolean).join(" / ");
                        })()}
                      </DetailTableTd>
                      <DetailTableTd>
                        {item.stockMoveId ? (
                          <Link
                            href={`/inventaris/mutasi-stok?id=${item.stockMoveId}`}
                            className="text-primary hover:underline"
                          >
                            SM-{item.stockMoveId}
                          </Link>
                        ) : receipt.status === "draft" ? (
                          <span className="text-xs text-muted-foreground">
                            Menunggu verifikasi
                          </span>
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

      {/* Jurnal — posted on verification (Dr Persediaan / Cr clearing). */}
      {journal ? (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <h2 className="mb-4 text-[0.9375rem] font-semibold text-foreground">
            Jurnal Akuntansi
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                No. Jurnal
              </span>
              <span className="text-[0.9375rem] font-medium">
                <Link
                  href={`/keuangan/jurnal/${journal.id}`}
                  className="text-primary hover:underline font-mono"
                >
                  {journal.journalNumber}
                </Link>
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Nilai Persediaan
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium tabular-nums">
                {formatCurrency(Number(journal.totalDebit))}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Status
              </span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {journal.status}
              </span>
            </div>
          </div>
        </div>
      ) : receipt.status === "draft" ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground">
          Jurnal belum dibuat. Jurnal akan otomatis terposting (Dr Persediaan /
          Cr Hutang Pembelian) begitu penerimaan ini diverifikasi.
        </div>
      ) : (
        <div className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-foreground">
          Penerimaan sudah diverifikasi tetapi <strong>jurnal belum terbentuk</strong>.
          Pastikan mapping akun (Persediaan &amp; Clearing Pembelian) sudah diisi di
          Pengaturan → Akuntansi, lalu hubungi admin untuk menjurnal ulang.
        </div>
      )}

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
