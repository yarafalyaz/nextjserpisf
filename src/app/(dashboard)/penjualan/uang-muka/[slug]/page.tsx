export const dynamic = "force-dynamic";

import Image from "next/image";
import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteDownPayment } from "@/actions/sales.actions";
import { StatusChip } from "@/components/ui/status-chip";
import { PrintButton } from "@/components/ui/print-button";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { ConfirmDownPaymentButton } from "../_components/confirm-dp-button";
import { CustomerCreditPanel } from "../_components/customer-credit-panel";
import { loadDownPaymentTaxStatusRows } from "@/lib/reports/down-payment-tax-status-data";
import { DownPaymentVatSnapshotCard } from "../_components/down-payment-vat-snapshot";
import {
  getPaymentMethodMap,
  resolvePaymentMethodName,
} from "@/lib/services/method.service";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityHref, entityEditHref } from "@/lib/utils/entity-url";
import { salesInvoiceLabel } from "@/lib/utils/invoice-label";
import { CanCreate } from "@/components/auth/can-create";
export const metadata: Metadata = { title: "Uang Muka" };

export default async function DownPaymentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_down_payments");

  const { slug } = await params

  const dp = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.downPayment.findFirst({
          where: { slug: s, ...where },
          include: {
            quotation: true,
            customer: true,
          },
        }),
      byId: (id, where) =>
        prisma.downPayment.findUnique({
          where: { id, ...where },
          include: {
            quotation: true,
            customer: true,
          },
        }),
    },
  );

  if (!dp) notFound();

  // Snapshot PPN per DP verbatim dari read-model server (PR #785) —
  // halaman menampilkan apa adanya, tidak menghitung ulang PPN.
  const [vatRow] = (await loadDownPaymentTaxStatusRows()).filter(
    (row) => row.downPaymentId === dp.id,
  );

  const pmMap = await getPaymentMethodMap();

  // AUD-R4-01: kredit dari DP ini + faktur terbuka pelanggan yang sama
  // (panel memanggil allocate/refund — rujukan nyata aksi→UI).
  const dpCredits = await prisma.customerCredit.findMany({
    where: { OR: [{ sourceType: "DownPayment", sourceId: dp.id }] },
    orderBy: { id: "desc" },
  });
  const openInvoices = await prisma.salesInvoice.findMany({
    where: {
      customerId: dp.customerId,
      status: { not: "cancelled" },
      paymentStatus: { not: "paid" },
    },
    select: { id: true, documentNo: true, grandTotal: true, paidAmount: true },
    orderBy: { id: "desc" },
    take: 20,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Uang Muka ${dp.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Uang Muka", href: "/penjualan/uang-muka" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={dp.status} />}
        actions={
          <>
            {dp.status === "draft" && (
              <>
                <ConfirmDownPaymentButton dpId={dp.id} />
                <CanCreate permission="edit_down_payments">
                  <Button
                    href={entityEditHref("/penjualan/uang-muka", dp)}
                    variant="primary"
                  >
                    Ubah
                  </Button>
                </CanCreate>
              </>
            )}
            {dp.status === "confirmed" && (
              <CanCreate permission="create_work_orders">
                <Button
                  href={`/produksi/perintah-kerja/tambah/penawaran/${dp.quotation?.slug ?? dp.quotationId}`}
                  variant="primary"
                >
                  + Perintah Kerja
                </Button>
              </CanCreate>
            )}
            <PrintButton documentType="down-payment" documentId={dp.id} />
            {dp.status === "draft" && (
              <CanCreate permission="delete_down_payments">
                <DeleteButton id={dp.id} action={deleteDownPayment} />
              </CanCreate>
            )}
            <BackButton href="/penjualan/uang-muka" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={dp.documentNo} mono />
        <DetailField
          label="Pelanggan"
          value={
            <Link href={entityHref("/master/pelanggan", dp.customer)}>
              {dp.customer.name}
            </Link>
          }
        />
        <DetailField
          label="Penawaran"
          value={
            <Link href={entityHref("/penjualan/penawaran", dp.quotation)}>
              {dp.quotation.documentNo}
            </Link>
          }
        />
        <DetailField
          label="Jumlah"
          value={
            <span className="text-xl">{formatCurrency(Number(dp.amount))}</span>
          }
        />
        <DetailField label="Tanggal Bayar" value={formatDate(dp.paymentDate)} />
        <DetailField
          label="Metode Pembayaran"
          value={resolvePaymentMethodName(dp.paymentMethod, pmMap)}
        />
        <DetailField label="Dibuat" value={formatDate(dp.createdAt)} />
      </DetailCard>

      {/* Proof Image */}
      {dp.proofImage && (
        <DetailCard>
          <DetailField
            label="Bukti Pembayaran"
            value={
              <Image
                src={dp.proofImage}
                alt="Bukti pembayaran"
                width={400}
                height={300}
                className="max-w-[400px] h-auto rounded-lg"
                unoptimized
              />
            }
            colSpan="full"
          />
        </DetailCard>
      )}

      {/* Snapshot PPN per DP (F-2026-10-25-004-V + 015-V): verbatim server. */}
      {vatRow && <DownPaymentVatSnapshotCard snapshot={vatRow} />}

      {/* AUD-R4-01: panel operasional kredit (alokasi/refund). */}
      {dpCredits.length > 0 && (
        <DetailCard title="Kredit Pelanggan dari DP ini">
          <CustomerCreditPanel credits={dpCredits} invoices={openInvoices.map((inv) => ({ ...inv, documentNo: salesInvoiceLabel(inv) }))} />
        </DetailCard>
      )}

      {/* Notes */}
      {dp.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={dp.notes} colSpan="full" />
        </DetailCard>
      )}
    </div>
  );
}
