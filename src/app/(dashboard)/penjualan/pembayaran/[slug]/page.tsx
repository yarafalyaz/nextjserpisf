export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteSalesPayment, reverseSalesPayment } from "@/actions/sales.actions";
import { ReversePaymentButton } from "@/components/ui/reverse-payment-button";
import { PrintButton } from "@/components/ui/print-button";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { TransactionAttachments } from "@/components/ui/transaction-attachments";
import { PostedLockNotice } from "@/components/ui/posted-lock-notice";
import { StatusChip } from "@/components/ui/status-chip";
import {
  getPaymentMethodMap,
  resolvePaymentMethodName,
} from "@/lib/services/method.service";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityHref, entityEditHref } from "@/lib/utils/entity-url";
import { CanCreate } from "@/components/auth/can-create";
export const metadata: Metadata = { title: "Pembayaran" };

export default async function SalesPaymentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_sales_payments");

  const { slug } = await params;

  const payment = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.salesPayment.findFirst({
          where: { slug: s, ...where },
          include: {
            salesInvoice: { include: { customer: true } },
          },
        }),
      byId: (id, where) =>
        prisma.salesPayment.findUnique({
          where: { id, ...where },
          include: {
            salesInvoice: { include: { customer: true } },
          },
        }),
    },
  );

  if (!payment) notFound();

  const pmMap = await getPaymentMethodMap();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pembayaran ${payment.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Pembayaran", href: "/penjualan/pembayaran" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={payment.status === "reversed" ? "reversed" : "posted"} />}
        actions={
          <>
            {/* GL-BR-003 K1: pembayaran reversed = histori read-only (server
                tolak edit/hapus reversed). posted aktif: Ubah boleh (server
                izinkan updateSalesPayment non-reversed), Hapus tampil tapi
                server fail-closed bila jurnal POSTED, ganti jalur K2 =
                Balikkan beralasan. */}
            {payment.status !== "reversed" && (
              <CanCreate permission="edit_sales_payments">
                <Button
                  href={entityEditHref("/penjualan/pembayaran", payment)}
                  variant="primary"
                >
                  Ubah
                </Button>
              </CanCreate>
            )}
            <PrintButton documentType="sales-payment" documentId={payment.id} />
            {payment.status !== "reversed" && (
              <CanCreate permission="delete_sales_payments">
                <ReversePaymentButton
                  id={payment.id}
                  action={reverseSalesPayment}
                  title={`Balikkan pembayaran ${payment.documentNo}?`}
                  body="Pembayaran ditandai dibalik dan jurnal kasnya dibalik. Bila faktur ikut lunas karenanya, status faktur dihitung ulang. Baris asal tetap tersimpan — bukan dihapus."
                />
                <DeleteButton id={payment.id} action={deleteSalesPayment} />
              </CanCreate>
            )}
            <BackButton href="/penjualan/pembayaran" />
          </>
        }
      />

      {/* GL-BR-003 K2: pembayaran lahir langsung posted — koreksi via
          pembalikan beralasan (tombol Balikkan di header), bukan hapus.
          Status jelas via chip di header. */}
      {payment.status === "reversed" && (
        <PostedLockNotice
          documentLabel={`Pembayaran ${payment.documentNo}`}
          correctionLabel="pembayaran pengganti baru"
        />
      )}

      <DetailCard>
        <DetailField label="No. Dokumen" value={payment.documentNo} mono />
        <DetailField
          label="Faktur"
          value={
            <Link href={entityHref("/penjualan/faktur", payment.salesInvoice)}>
              {payment.salesInvoice.documentNo}
            </Link>
          }
        />
        <DetailField
          label="Pelanggan"
          value={
            payment.salesInvoice.customer ? (
              <Link
                href={entityHref("/master/pelanggan", payment.salesInvoice.customer)}
              >
                {payment.salesInvoice.customer.name}
              </Link>
            ) : (
              "-"
            )
          }
        />
        <DetailField
          label="Jumlah"
          value={
            <span className="text-xl">
              {formatCurrency(Number(payment.amount))}
            </span>
          }
        />
        <DetailField
          label="Tanggal Bayar"
          value={formatDate(payment.paymentDate)}
        />
        <DetailField
          label="Metode Pembayaran"
          value={resolvePaymentMethodName(payment.paymentMethod, pmMap)}
        />
        <DetailField label="Dibuat" value={formatDate(payment.createdAt)} />
      </DetailCard>

      {/* Notes */}
      {payment.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={payment.notes} colSpan="full" />
        </DetailCard>
      )}

      <TransactionAttachments
        referenceType="sales_payment"
        referenceId={payment.id}
      />
    </div>
  );
}
