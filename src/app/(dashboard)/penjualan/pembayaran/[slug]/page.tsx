export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteSalesPayment } from "@/actions/sales.actions";
import { PrintButton } from "@/components/ui/print-button";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { TransactionAttachments } from "@/components/ui/transaction-attachments";
import {
  getPaymentMethodMap,
  resolvePaymentMethodName,
} from "@/lib/services/method.service";
import {
  PaymentReversalButton,
  PaymentReversalNotice,
} from "@/components/ui/payment-reversal-button";
import { StatusChip } from "@/components/ui/status-chip";
import { hasPermission } from "@/lib/auth/permissions";

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
        actions={
          <>
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
            <PaymentReversalButton
              kind="sales"
              id={payment.id}
              documentNo={payment.documentNo}
              status={payment.status}
              canReverse={await hasPermission("delete_sales_payments")}
            />
            {payment.status !== "reversed" && (
              <CanCreate permission="delete_sales_payments">
                <DeleteButton id={payment.id} action={deleteSalesPayment} />
              </CanCreate>
            )}
            <BackButton href="/penjualan/pembayaran" />
          </>
        }
      />

      <PaymentReversalNotice
        status={payment.status}
        reversalReason={payment.reversalReason}
        reversedAt={payment.reversedAt}
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={payment.documentNo} mono />
        <DetailField
          label="Status"
          value={<StatusChip status={payment.status} />}
        />
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
