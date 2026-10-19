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
import {
  getPaymentMethodMap,
  resolvePaymentMethodName,
} from "@/lib/services/method.service";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityHref, entityEditHref } from "@/lib/utils/entity-url";
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
                <Button
                  href={entityEditHref("/penjualan/uang-muka", dp)}
                  variant="primary"
                >
                  Ubah
                </Button>
              </>
            )}
            {dp.status === "confirmed" && (
              <Button
                href={`/produksi/perintah-kerja/tambah?quotationId=${dp.quotationId}`}
                variant="primary"
              >
                + Perintah Kerja
              </Button>
            )}
            <PrintButton documentType="down-payment" documentId={dp.id} />
            {dp.status === "draft" && (
              <DeleteButton id={dp.id} action={deleteDownPayment} />
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

      {/* AUD-R4-01: panel operasional kredit (alokasi/refund). */}
      {dpCredits.length > 0 && (
        <DetailCard title="Kredit Pelanggan dari DP ini">
          <CustomerCreditPanel credits={dpCredits} invoices={openInvoices} />
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
