export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityHref, entityEditHref } from "@/lib/utils/entity-url";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { statusLabel } from "@/lib/utils/status-labels";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { DetailTabs } from "@/components/ui/detail-tabs";
import { StatusActions } from "@/components/ui/status-actions";
import { QuotationFlowActions } from "./_components/quotation-flow-actions";
import { PrintButton } from "@/components/ui/print-button";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { EmptyState } from "@/components/ui/empty-state";
import { JobBillingCard } from "@/components/reports/job-billing-card";
import { isQuotationExpired } from "@/lib/utils/quotation-expiry";
import { buildInvoiceThresholdInfo } from "@/lib/sales/invoice-threshold";
import { QuotationInvoiceThresholdCard } from "@/components/reports/quotation-invoice-threshold-card";
import { WhatsappButton } from "@/components/reports/whatsapp-button";
import { WhatsappTrailNote } from "@/components/reports/whatsapp-trail-note";
import { getWhatsappTrail } from "@/lib/reports/whatsapp-trail-data";
import { buildWhatsappMessage } from "@/lib/utils/whatsapp";
import { DifferenceInvoiceButton } from "@/components/reports/difference-invoice-button";
import { ProgressInvoiceButton } from "@/components/reports/progress-invoice-button";
import { RevisionDownCreditButton } from "@/components/reports/revision-down-credit-button";
import { loadJobBillingSummary } from "@/lib/reports/job-billing-summary-data";
import { getJobPaymentScheduleForQuotation } from "@/actions/job-payment-schedule.actions";
import { loadQuotationApprovalGate } from "@/lib/reports/quotation-approval-gate-data";
import { QuotationApprovalGateCard } from "@/components/reports/quotation-approval-gate-card";
import { getQuotationRevisionDelta } from "@/lib/reports/quotation-revision-delta-data";
import { QuotationRevisionDeltaCard } from "@/components/reports/quotation-revision-delta-card";
import { FitmentBadge, FitmentIncompatibleSummary } from "@/components/reports/fitment-badge";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";
import { LockedDocNotice } from "@/components/ui/locked-edit-guard";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Penawaran" };

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_quotations");
  const canApprove = await hasPermission("approve_quotations");
  const canManagePaymentSchedule = await hasPermission("edit_quotations");
  const { slug } = await params;

  const quotationInclude = {
    customer: true,
    sections: { include: { items: true }, orderBy: { sortOrder: "asc" } },
    downPayments: { orderBy: { createdAt: "desc" } },
    salesOrders: { orderBy: { createdAt: "desc" } },
    workOrders: { orderBy: { createdAt: "desc" } },
    salesInvoices: { orderBy: { createdAt: "desc" } },
    histories: { orderBy: { createdAt: "desc" }, take: 10 },
  } as const;

  const quotation = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) =>
        prisma.quotation.findFirst({
          where: { slug: s, ...where },
          include: quotationInclude,
        }),
      byId: (id, where) =>
        prisma.quotation.findUnique({
          where: { id, ...where },
          include: quotationInclude,
        }),
    },
  );

  if (!quotation) notFound();

  // F-036 tahap 2: jejak klik tautan WA terakhir (label jujur, bukan terkirim).
  const whatsappTrail = await getWhatsappTrail("Quotation", quotation.id);

  const [billingSummary, approvalGate, revisionDelta, paymentSchedule] = await Promise.all([
    loadJobBillingSummary(quotation.id),
    loadQuotationApprovalGate(quotation),
    getQuotationRevisionDelta(quotation.id),
    getJobPaymentScheduleForQuotation(quotation.id),
  ]);

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

  // GL-BR-003 K1: cermin guard server updateQuotation fail-closed
  // (cancelled/setelah-pelunasan-nyata pasti ditolak). Fakta pelunasan dari
  // loader server (bukan hitungan UI): count pembayaran nyata turunan.
  const quotationRealSettlementCount = await prisma.salesPayment.count({
    where: {
      NOT: { paymentMethod: "down_payment" },
      salesInvoice: {
        OR: [
          { quotationId: quotation.id },
          { salesOrder: { quotationId: quotation.id } },
        ],
      },
    },
  });
  const quotationEditable =
    quotation.status !== "cancelled" && quotationRealSettlementCount === 0;

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
            {/* GL-BR-003 K1: cermin guard server updateQuotation
                (cancelled/setelah-pelunasan-nyata pasti ditolak). */}
            {quotationEditable && (
              <Button
                href={entityEditHref("/penjualan/penawaran", quotation)}
                variant="secondary"
              >
                <Pencil size={14} /> Ubah
              </Button>
            )}
            <PrintButton documentType="quotation" documentId={quotation.id} />
            <WhatsappButton
              phone={quotation.customer.phone}
              modelType="Quotation"
              modelId={quotation.id}
              surface="detail"
              message={buildWhatsappMessage({
                customerName: quotation.customer.name,
                documentLabel: "Penawaran",
                documentNo: quotation.documentNo,
                status: quotation.status,
              })}
            />
            <QuotationFlowActions status={quotation.status} id={quotation.id} />
            {["accepted", "approved"].includes(quotation.status) && (
              <>
                <Button
                  href={`/penjualan/uang-muka/tambah/penawaran/${quotation.slug ?? quotation.id}`}
                  variant="secondary"
                >
                  + Uang Muka
                </Button>
                {quotation.salesOrders.length === 0 ? (
                  <Button
                    href={`/penjualan/pesanan/tambah/penawaran/${quotation.slug ?? quotation.id}`}
                    variant="primary"
                  >
                    + Pesanan Penjualan
                  </Button>
                ) : (
                  /* Penawaran ini sudah dikonversi: tampilkan tautan ke pesanan
                     yang sudah ada, bukan tombol yang bisa membuat pesanan kedua
                     (penjagaan keduanya ada di createSalesOrder). */
                  <Button
                    href={entityHref("/penjualan/pesanan", quotation.salesOrders[0])}
                    variant="secondary"
                  >
                    Pesanan {quotation.salesOrders[0].documentNo}
                  </Button>
                )}
              </>
            )}
            <BackButton href="/penjualan/penawaran" />
          </>
        }
      />

      <WhatsappTrailNote trail={whatsappTrail} />

      {/* GL-BR-003 K2: penawaran terkunci (cancelled/pelunasan nyata) —
          koreksi via revisi/penawaran baru, bukan edit dokumen terkunci. */}
      {!quotationEditable && (
        <LockedDocNotice kind="penawaran" documentNo={quotation.documentNo} />
      )}

      <DetailTabs
        ariaLabel="Tab detail penawaran"
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
                  canAct={canApprove}
                />
                <DetailCard columns={4}>
                  <DetailField
                    label="Pelanggan"
                    value={
                      <Link href={entityHref("/master/pelanggan", quotation.customer)}>
                        {quotation.customer.name}
                      </Link>
                    }
                  />
                  <DetailField
                    label="Tanggal"
                    value={formatDate(quotation.date)}
                  />
                  <DetailField
                    label="Berlaku Sampai"
                    value={
                      <>
                        {formatDate(quotation.validUntil)}
                        {isQuotationExpired(quotation.validUntil) ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                            Lewat masa berlaku
                          </span>
                        ) : null}
                      </>
                    }
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
                    label="Uang Muka Terbayar"
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

                {billingSummary ? (
                  <JobBillingCard
                    summary={billingSummary}
                    deltaNilaiCents={revisionDelta?.deltaCents ?? null}
                    paymentSchedule={paymentSchedule}
                    canManagePaymentSchedule={canManagePaymentSchedule}
                  />
                ) : null}

                <QuotationInvoiceThresholdCard
                  info={buildInvoiceThresholdInfo(
                    quotation.invoiceThresholdPercent == null
                      ? null
                      : Number(quotation.invoiceThresholdPercent),
                  )}
                />

                <QuotationApprovalGateCard gate={approvalGate} />

                <QuotationRevisionDeltaCard delta={revisionDelta} />

                <div className="flex flex-wrap justify-end gap-2">
                  <ProgressInvoiceButton quotationId={quotation.id} />
                  {quotation.revisionNumber > 0 ? (
                    <>
                    <DifferenceInvoiceButton
                      quotationId={quotation.id}
                      revisionNumber={quotation.revisionNumber}
                    />
                    <RevisionDownCreditButton
                      quotationId={quotation.id}
                      revisionNumber={quotation.revisionNumber}
                    />
                    </>
                  ) : null}
                </div>

                {/* Down Payments */}
                {quotation.downPayments.length > 0 && (
                  <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
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
            label: "Barang",
            content: (
              <>
                {/* F-063-S: ringkasan snapshot fitment tersimpan server
                    (bukan evaluasi ulang); 0 incompatible → senyap. */}
                <FitmentIncompatibleSummary
                  incompatibleCount={quotation.sections.reduce(
                    (sum, section) =>
                      sum +
                      section.items.filter((i) => i.fitmentResult === "incompatible").length,
                    0,
                  )}
                />
                {/* Sections & Items */}
                {quotation.sections.map((section) => (
                  <div
                    key={section.id}
                    className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
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
                                    `Barang #${item.itemId}`
                                  )}
                                  <FitmentBadge
                                    fitmentResult={item.fitmentResult}
                                    fitmentRuleId={item.fitmentRuleId}
                                  />
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
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">
                    Riwayat
                  </h2>
                </div>
                <div className="p-4 px-5">
                  {historyItems.length === 0 ? (
                    <EmptyState title="Belum ada riwayat" />
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
