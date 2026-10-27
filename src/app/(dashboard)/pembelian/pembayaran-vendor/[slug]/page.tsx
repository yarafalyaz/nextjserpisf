export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVendorPayment } from "@/actions/purchase.actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { PaymentReversalButton, PaymentReversalNotice } from "@/components/ui/payment-reversal-button"
import { StatusChip } from "@/components/ui/status-chip"
import { hasPermission } from "@/lib/auth/permissions"
import { getPaymentMethodMap, resolvePaymentMethodName } from "@/lib/services/method.service"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Pembayaran Pemasok" }

export default async function VendorPaymentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_vendor_payments")

  const { slug } = await params

  const payment = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.vendorPayment.findFirst({
          where: { slug: s, ...where },
          include: {
            vendor: true,
            allocations: true,
          },
        }),
      byId: (id, where) =>
        prisma.vendorPayment.findUnique({
          where: { id, ...where },
          include: {
            vendor: true,
            allocations: true,
          },
        }),
    },
  )

  if (!payment) notFound()

  const pmMap = await getPaymentMethodMap()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pembayaran Pemasok ${payment.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Pembayaran Pemasok", href: "/pembelian/pembayaran-vendor" },
          { label: "Detail" },
        ]}
        actions={
          <>
            {payment.status !== "reversed" && (
              <CanCreate permission="edit_vendor_payments">
                <Button href={entityEditHref("/pembelian/pembayaran-vendor", payment)} variant="primary">Ubah</Button>
              </CanCreate>
            )}
            <PrintButton documentType="vendor-payment" documentId={payment.id} />
            <PaymentReversalButton
              kind="vendor"
              id={payment.id}
              documentNo={payment.documentNo}
              status={payment.status}
              canReverse={await hasPermission("delete_vendor_payments")}
            />
            {payment.status !== "reversed" && (
              <CanCreate permission="delete_vendor_payments">
                <DeleteButton id={payment.id} action={deleteVendorPayment} />
              </CanCreate>
            )}
            <BackButton href="/pembelian/pembayaran-vendor" />
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
        <DetailField label="Status" value={<StatusChip status={payment.status} />} />
        <DetailField
          label="Vendor"
          value={<Link href={entityHref("/master/vendor", payment.vendor)}>{payment.vendor.name}</Link>}
        />
        <DetailField label="Jumlah" value={<span className="text-xl">{formatCurrency(Number(payment.amount))}</span>} />
        <DetailField label="Biaya Admin Bank" value={formatCurrency(Number(payment.adminFee))} />
        <DetailField label="Total Keluar dari Bank" value={formatCurrency(Number(payment.amount) + Number(payment.adminFee))} />
        <DetailField label="Tanggal Bayar" value={formatDate(payment.paymentDate)} />
        <DetailField label="Metode Pembayaran" value={resolvePaymentMethodName(payment.paymentMethod, pmMap)} />
        <DetailField label="Dibuat" value={formatDate(payment.createdAt)} />
      </DetailCard>

      {/* Allocations */}
      {payment.allocations.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Alokasi Pembayaran</h2>
          </div>
          <div className="p-4 px-5">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>ID Tagihan</DetailTableTh>
                <DetailTableTh align="right">Jumlah</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {payment.allocations.map((alloc) => (
                  <DetailTableRow key={alloc.id}>
                    <DetailTableTd><Link href={`/pembelian/tagihan/${alloc.vendorBillId}`}>Tagihan #{alloc.vendorBillId}</Link></DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(alloc.amount))}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      )}

      {/* Notes */}
      {payment.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={payment.notes} colSpan="full" />
        </DetailCard>
      )}

      <TransactionAttachments referenceType="vendor_payment" referenceId={payment.id} />
    </div>
  )
}
