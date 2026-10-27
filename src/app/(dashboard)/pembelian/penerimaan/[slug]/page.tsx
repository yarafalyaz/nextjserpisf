 
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { statusLabel } from "@/lib/utils/status-labels";
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
import { EmptyState } from "@/components/ui/empty-state";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import {
  GOODS_RECEIPT_JOURNAL_REF_TYPE,
  GOODS_RECEIPT_SERVICE_JOURNAL_REF_TYPE,
} from "@/lib/services/stock-journal.service";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { canViewWarehouseScopedDocument } from "@/lib/auth/document-scope";
import { entityHref, entityEditHref } from "@/lib/utils/entity-url";
import { CanCreate } from "@/components/auth/can-create";
export const metadata: Metadata = { title: "Penerimaan Barang" };

export default async function GoodsReceiptDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_goods_receipts");

  const { slug } = await params;

  const receipt = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.goodsReceipt.findFirst({
          where: { slug: s, ...where },
          include: {
            purchaseOrder: { include: { vendor: true, items: true } },
            warehouse: true,
            items: true,
            vendorBills: {
              where: { status: { notIn: ["cancelled"] } },
              select: { id: true, slug: true, documentNo: true, grandTotal: true, status: true },
            },
          },
        }),
      byId: (id, where) =>
        prisma.goodsReceipt.findUnique({
          where: { id, ...where },
          include: {
            purchaseOrder: { include: { vendor: true, items: true } },
            warehouse: true,
            items: true,
            vendorBills: {
              where: { status: { notIn: ["cancelled"] } },
              select: { id: true, slug: true, documentNo: true, grandTotal: true, status: true },
            },
          },
        }),
    },
  );

  if (!receipt) notFound();

  // Batas gudang: penjagaan yang SAMA dengan lampiran & cetak
  // (lib/auth/document-scope) — dokumen gudang lain tidak boleh dibaca.
  if (!(await canViewWarehouseScopedDocument("goods_receipt", receipt.id))) notFound();

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

  // Jurnal GL yang diposting saat penerimaan diverifikasi. Penerimaan CAMPURAN
  // (barang + jasa) memposting DUA jurnal untuk penerimaan yang sama: persediaan
  // (penanda "GoodsReceipt") dan beban jasa (penanda "GoodsReceiptService") — lihat
  // stock-journal.service; penandanya wajib berbeda karena `journals` unik pada
  // (reference_type, reference_id). Keduanya diambil supaya halaman ini tidak
  // menyembunyikan jurnal jasa. Penerimaan draft belum punya jurnal.
  const journals = await prisma.journal.findMany({
    where: {
      referenceType: {
        in: [GOODS_RECEIPT_JOURNAL_REF_TYPE, GOODS_RECEIPT_SERVICE_JOURNAL_REF_TYPE],
      },
      referenceId: receipt.id,
    },
    select: {
      id: true,
      slug: true,
      journalNumber: true,
      totalDebit: true,
      status: true,
      referenceType: true,
    },
    orderBy: { id: "asc" },
  });

  // GoodsReceiptItem.stockMoveId hanya FK skalar (tanpa relasi), jadi slug mutasi
  // stok diambil sekali untuk seluruh baris agar tautannya menuju halaman detail
  // — sebelumnya tautan memakai `?id=`, yang tidak dibaca halaman tujuan.
  const stockMoveIds = receipt.items
    .map((item) => item.stockMoveId)
    .filter((id): id is number => id != null);
  const stockMoves = stockMoveIds.length
    ? await prisma.stockMove.findMany({
        where: { id: { in: stockMoveIds } },
        select: { id: true, slug: true },
      })
    : [];
  const stockMoveSlugById = new Map(stockMoves.map((move) => [move.id, move.slug]));

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
                <CanCreate permission="edit_goods_receipts">
                  <Link
                    href={entityEditHref("/pembelian/penerimaan", receipt)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
                  >
                    Ubah
                  </Link>
                </CanCreate>
                <CanCreate permission="delete_goods_receipts">
                  <DeleteButton id={receipt.id} action={deleteGoodsReceipt} />
                </CanCreate>
              </>
            )}
            <PrintButton documentType="goods-receipt" documentId={receipt.id} />
            {/* "Buat Tagihan dari Penerimaan" — jalur yang mengisi
                VendorBill.goodsReceiptId + VendorBillItem.goodsReceiptItemId,
                sehingga laporan Diterima Belum Ditagih mengenali penerimaan ini.
                Hanya untuk penerimaan yang sudah diverifikasi (draft belum
                menambah stok / membersihkan clearing, jadi tak bisa ditagih). */}
            {["verified", "completed"].includes(receipt.status) && receipt.vendorBills.length === 0 && (
              <CanCreate permission="create_vendor_bills">
                <Link
                  href={`/pembelian/tagihan/tambah/penerimaan/${receipt.slug ?? receipt.id}`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
                >
                  Buat Tagihan
                </Link>
              </CanCreate>
            )}
            <BackButton href="/pembelian/penerimaan" />
          </>
        }
      />

      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
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
              <Link href={entityHref("/pembelian/pesanan", receipt.purchaseOrder)}>
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
                  href={entityHref("/master/vendor", receipt.purchaseOrder.vendor)}
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
                <Link href={entityHref("/master/gudang", receipt.warehouse)}>
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
        <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
          <h2 className="mb-4 text-[0.9375rem] font-semibold text-foreground">
            Komponen Biaya Perolehan (estimasi PO)
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
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Item Diterima
          </h2>
        </div>
        <div className="p-4 px-5">
          {receipt.items.length === 0 ? (
            <EmptyState title="Tidak ada item" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Barang</DetailTableTh>
                <DetailTableTh align="right">Kuantitas Dipesan</DetailTableTh>
                <DetailTableTh align="right">Kuantitas Diterima</DetailTableTh>
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
                            href={entityHref("/inventaris/mutasi-stok", {
                              id: item.stockMoveId,
                              slug: stockMoveSlugById.get(item.stockMoveId) ?? null,
                            })}
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

      {/* Tagihan yang menagih penerimaan ini — sisi balik dari
          VendorBill.goodsReceiptId, supaya rantai penerimaan → tagihan terlihat
          dari penerimaannya juga. */}
      {receipt.vendorBills.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              Tagihan Pemasok
            </h2>
          </div>
          <div className="p-4 px-5">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Dokumen</DetailTableTh>
                <DetailTableTh align="right">Total</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {receipt.vendorBills.map((bill) => (
                  <DetailTableRow key={bill.id}>
                    <DetailTableTd className="font-mono">
                      <Link href={entityHref("/pembelian/tagihan", bill)} className="text-primary hover:underline">
                        {bill.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(bill.grandTotal))}</DetailTableTd>
                    <DetailTableTd><StatusChip status={bill.status} /></DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      )}

      {/* Jurnal — posted on verification (Dr Persediaan / Cr clearing, plus a
          separate Dr Beban Jasa journal for the service lines of a mixed
          goods+service receipt). */}
      {journals.length > 0 ? (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
          <h2 className="mb-4 text-[0.9375rem] font-semibold text-foreground">
            Jurnal Akuntansi
          </h2>
          <div className="flex flex-col gap-4">
            {journals.map((journal) => (
              <div
                key={journal.id}
                className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    No. Jurnal
                  </span>
                  <span className="text-[0.9375rem] font-medium">
                    <Link
                      href={entityHref("/keuangan/jurnal", journal)}
                      className="text-primary hover:underline font-mono"
                    >
                      {journal.journalNumber}
                    </Link>
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {journal.referenceType === GOODS_RECEIPT_SERVICE_JOURNAL_REF_TYPE
                      ? "Nilai Beban Jasa"
                      : "Nilai Persediaan"}
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
                    {statusLabel(journal.status)}
                  </span>
                </div>
              </div>
            ))}
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
        <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
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
