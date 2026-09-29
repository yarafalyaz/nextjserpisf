export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { statusLabel } from "@/lib/utils/status-labels";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { DetailTabs } from "@/components/ui/detail-tabs";
import { StatusActions } from "@/components/ui/status-actions";
import { PrintButton } from "@/components/ui/print-button";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Penawaran" };

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("view_quotations");
  const { id } = await params;
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const quotation = await prisma.quotation.findUnique({
    where: { id: numId, deletedAt: null },
    include: {
      customer: true,
      sections: { include: { items: true }, orderBy: { sortOrder: "asc" } },
      downPayments: { orderBy: { createdAt: "desc" } },
      salesOrders: { orderBy: { createdAt: "desc" } },
      workOrders: { orderBy: { createdAt: "desc" } },
      salesInvoices: { orderBy: { createdAt: "desc" } },
      histories: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!quotation) notFound();

  const itemIds = quotation.sections
    .flatMap((section) => section.items.map((item) => item.itemId))
    .filter((itemId): itemId is number => itemId !== null);

  const dbItems = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, name: true, sku: true },
      })
    : [];

  const itemMap = new Map(dbItems.map((i) => [i.id, i]));

  const totalDP = quotation.downPayments
    .filter((dp) => dp.status === "confirmed")
    .reduce((sum, dp) => sum + Number(dp.amount), 0);
  const remaining = Math.max(0, Number(quotation.grandTotal) - totalDP);

  // Synthesize timeline/history items
  const historyItems: Array<{
    id: string;
    createdAt: Date;
    action: string;
    description: string;
  }> = [];

  // 1. Initial creation
  historyItems.push({
    id: `created-${quotation.id}`,
    createdAt: quotation.createdAt,
    action: "Pembuatan",
    description: `Penawaran dibuat dengan status ${statusLabel(quotation.status)}`,
  });

  // 2. Database histories (revisions)
  quotation.histories.forEach((h) => {
    historyItems.push({
      id: `h-${h.id}`,
      createdAt: h.createdAt,
      action: h.action === "revised" ? "Revisi" : h.action,
      description: h.description ?? "",
    });
  });

  // 3. Down payments
  quotation.downPayments.forEach((dp) => {
    historyItems.push({
      id: `dp-${dp.id}`,
      createdAt: dp.createdAt,
      action: "Uang Muka",
      description: `Uang muka sebesar ${formatCurrency(Number(dp.amount))} diterima dengan status ${statusLabel(dp.status)} (${dp.documentNo})`,
    });
  });

  // 4. Sales Orders
  quotation.salesOrders.forEach((so) => {
    historyItems.push({
      id: `so-${so.id}`,
      createdAt: so.createdAt,
      action: "Pesanan Penjualan",
      description: `Dikonversi menjadi Pesanan Penjualan ${so.documentNo} sebesar ${formatCurrency(Number(so.grandTotal))}`,
    });
  });

  // 5. Work Orders
  quotation.workOrders.forEach((wo) => {
    historyItems.push({
      id: `wo-${wo.id}`,
      createdAt: wo.createdAt,
      action: "Perintah Kerja",
      description: `Perintah Kerja ${wo.documentNo} dibuat`,
    });
  });

  // 6. Sales Invoices
  quotation.salesInvoices.forEach((inv) => {
    historyItems.push({
      id: `inv-${inv.id}`,
      createdAt: inv.createdAt,
      action: "Faktur",
      description: `Dikonversi menjadi Faktur ${inv.documentNo} sebesar ${formatCurrency(Number(inv.grandTotal))} - ${statusLabel(inv.status)}`,
    });
  });

  // Sort descending by createdAt
  historyItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Penawaran ${quotation.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Penawaran", href: "/penjualan/penawaran" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={quotation.status} />}
        actions={
          <>
            <Button
              href={`/penjualan/penawaran/${id}/ubah`}
              variant="secondary"
            >
              <Pencil size={14} /> Ubah
            </Button>
            <PrintButton documentType="quotation" documentId={quotation.id} />
            {["accepted", "approved"].includes(quotation.status) && (
              <>
                <Button
                  href={`/penjualan/uang-muka/tambah?quotationId=${id}`}
                  variant="secondary"
                >
                  + Uang Muka
                </Button>
                <Button
                  href={`/penjualan/pesanan/tambah?quotationId=${id}`}
                  variant="primary"
                >
                  + Pesanan Penjualan
                </Button>
              </>
            )}
            <BackButton href="/penjualan/penawaran" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Quotation detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <StatusActions
                  status={quotation.status}
                  id={quotation.id}
                  module="penjualan/penawaran"
                />
                <DetailCard columns={4}>
                  <DetailField
                    label="Pelanggan"
                    value={
                      <Link href={`/master/pelanggan/${quotation.customerId}`}>
                        {quotation.customer.name}
                      </Link>
                    }
                  />
                  <DetailField
                    label="Tanggal"
                    value={formatDate(quotation.date)}
                  />
                  <DetailField
                    label="Valid Sampai"
                    value={formatDate(quotation.validUntil)}
                  />
                  <DetailField
                    label="Total Keseluruhan"
                    value={formatCurrency(Number(quotation.grandTotal))}
                  />
                </DetailCard>

                {/* Summary */}
                <DetailCard columns={3}>
                  <DetailField
                    label="Subtotal"
                    value={formatCurrency(Number(quotation.subtotal))}
                  />
                  <DetailField
                    label="Diskon"
                    value={formatCurrency(Number(quotation.discount))}
                  />
                  <DetailField
                    label="Pajak"
                    value={formatCurrency(Number(quotation.tax))}
                  />
                  <DetailField
                    label="Total Keseluruhan"
                    value={formatCurrency(Number(quotation.grandTotal))}
                  />
                  <DetailField
                    label="Uang Muka (DP) Terbayar"
                    value={
                      <span className="text-emerald-600 font-semibold">
                        {formatCurrency(totalDP)}
                      </span>
                    }
                  />
                  <DetailField
                    label="Sisa Pembayaran"
                    value={
                      <span className="text-lg font-bold text-foreground">
                        {formatCurrency(remaining)}
                      </span>
                    }
                  />
                </DetailCard>

                {/* Down Payments */}
                {quotation.downPayments.length > 0 && (
                  <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                      <h2 className="text-[0.9375rem] font-semibold text-foreground">
                        Riwayat Pembayaran Uang Muka
                      </h2>
                    </div>
                    <div className="p-4 px-5">
                      <DetailTable>
                        <DetailTableHead>
                          <DetailTableTh>Jumlah</DetailTableTh>
                          <DetailTableTh>Status</DetailTableTh>
                          <DetailTableTh>Dibuat</DetailTableTh>
                        </DetailTableHead>
                        <DetailTableBody>
                          {quotation.downPayments.map((dp) => (
                            <DetailTableRow key={dp.id}>
                              <DetailTableTd>
                                {formatCurrency(Number(dp.amount))}
                              </DetailTableTd>
                              <DetailTableTd>
                                <StatusChip status={dp.status} />
                              </DetailTableTd>
                              <DetailTableTd>
                                {formatDate(dp.createdAt)}
                              </DetailTableTd>
                            </DetailTableRow>
                          ))}
                        </DetailTableBody>
                      </DetailTable>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {quotation.notes && (
                  <DetailCard>
                    <DetailField
                      label="Catatan"
                      value={quotation.notes}
                      colSpan="full"
                    />
                  </DetailCard>
                )}
              </>
            ),
          },
          {
            id: "items",
            label: "Item",
            content: (
              <>
                {/* Sections & Items */}
                {quotation.sections.map((section) => (
                  <div
                    key={section.id}
                    className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
                  >
                    <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                      <h2 className="text-[0.9375rem] font-semibold text-foreground">
                        {section.name}
                      </h2>
                    </div>
                    <div className="p-4 px-5">
                      <DetailTable>
                        <DetailTableHead>
                          <DetailTableTh>Produk</DetailTableTh>
                          <DetailTableTh>Deskripsi</DetailTableTh>
                          <DetailTableTh align="right">Jml</DetailTableTh>
                          <DetailTableTh>Satuan</DetailTableTh>
                          <DetailTableTh align="right">Harga</DetailTableTh>
                          <DetailTableTh align="right">Diskon</DetailTableTh>
                          <DetailTableTh align="right">Total</DetailTableTh>
                        </DetailTableHead>
                        <DetailTableBody>
                          {section.items.map((item) => {
                            const matchedItem = item.itemId ? itemMap.get(item.itemId) : null;
                            return (
                              <DetailTableRow key={item.id}>
                                <DetailTableTd>
                                  {matchedItem ? (
                                    <div className="flex flex-col">
                                      <span className="font-medium text-foreground">{matchedItem.name}</span>
                                      <span className="text-xs text-muted-foreground">{matchedItem.sku}</span>
                                    </div>
                                  ) : (
                                    `Item #${item.itemId}`
                                  )}
                                </DetailTableTd>
                                <DetailTableTd>
                                  {item.description || "-"}
                                </DetailTableTd>
                                <DetailTableTd align="right">
                                  {Number(item.qty)}
                                </DetailTableTd>
                                <DetailTableTd>{item.uom || "-"}</DetailTableTd>
                                <DetailTableTd align="right">
                                  {formatCurrency(Number(item.unitPrice))}
                                </DetailTableTd>
                                <DetailTableTd align="right">
                                  {formatCurrency(Number(item.discount))}
                                </DetailTableTd>
                                <DetailTableTd align="right">
                                  {formatCurrency(Number(item.total))}
                                </DetailTableTd>
                              </DetailTableRow>
                            );
                          })}
                        </DetailTableBody>
                      </DetailTable>
                    </div>
                  </div>
                ))}
              </>
            ),
          },
          {
            id: "history",
            label: "Riwayat",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">
                    Riwayat
                  </h2>
                </div>
                <div className="p-4 px-5">
                  {historyItems.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                      Belum ada riwayat
                    </p>
                  ) : (
                    historyItems.map((item) => (
                      <div
                        key={item.id}
                        className="py-2 border-b border-default text-[0.8125rem]"
                      >
                        <strong className="capitalize">{item.action}</strong> — {item.description || ""}{" "}
                        <span className="text-muted-foreground">
                          ({formatDate(item.createdAt, { includeTime: true })})
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
