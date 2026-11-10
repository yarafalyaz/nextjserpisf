export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVendorPayment, reverseVendorPayment } from "@/actions/purchase.actions"
import { PrintButton } from "@/components/ui/print-button"
import { ReversePaymentButton } from "@/components/ui/reverse-payment-button"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { getPaymentMethodMap, resolvePaymentMethodName } from "@/lib/services/method.service"
import { DRAFT_ONLY_EDIT_STATUSES } from "@/lib/constants/status"

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
            allocations: {
              include: {
                vendorBill: { select: { id: true, slug: true, documentNo: true } },
              },
            },
          },
        }),
      byId: (id, where) =>
        prisma.vendorPayment.findUnique({
          where: { id, ...where },
          include: {
            vendor: true,
            allocations: {
              include: {
                vendorBill: { select: { id: true, slug: true, documentNo: true } },
              },
            },
          },
        }),
    },
  )

  if (!payment) notFound()

  // Hanya draft yang menerima edit/hapus (lihat updateVendorPayment /
  // deleteVendorPayment). Pembayaran posted dikoreksi lewat pembayaran pengganti.
  const isDraft = (DRAFT_ONLY_EDIT_STATUSES as readonly string[]).includes(payment.status)

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
            {/* updateVendorPayment/deleteVendorPayment menolak selain draft;
                pembayaran posted dikoreksi lewat pembayaran pengganti. */}
            {isDraft && (
              <CanCreate permission="edit_vendor_payments">
                <Button href={entityEditHref("/pembelian/pembayaran-vendor", payment)} variant="primary">Ubah</Button>
              </CanCreate>
            )}
            <PrintButton documentType="vendor-payment" documentId={payment.id} />
            {isDraft && (
              <CanCreate permission="delete_vendor_payments">
                <DeleteButton id={payment.id} action={deleteVendorPayment} />
              </CanCreate>
            )}
            {/* FIN-BR-008: pembayaran completed dikoreksi lewat pembalikan
                beralasan — baris asal tetap ada (status `reversed`), jurnal
                lawan dibukukan, alokasi tagihan dikembalikan. Tanpa tombol ini
                pembayaran vendor yang sudah dibayar tidak punya jalur koreksi
                apa pun dari UI (hanya Cetak), padahal jalur penjualan
                (reverseSalesPayment) sudah tersambung sejak lama. */}
            {payment.status === "completed" && (
              <CanCreate permission="delete_vendor_payments">
                <ReversePaymentButton
                  id={payment.id}
                  action={reverseVendorPayment}
                  title={`Balikkan pembayaran ${payment.documentNo}?`}
                  body="Pembayaran ditandai dibalik, jurnal kasnya dibalik, dan saldo tagihan yang dilunasi kembali seperti semula. Baris asal tetap tersimpan sebagai histori — bukan dihapus."
                />
              </CanCreate>
            )}
            <BackButton href="/pembelian/pembayaran-vendor" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={payment.documentNo} mono />
        <DetailField
          label="Vendor"
          value={<Link href={entityHref("/master/vendor", payment.vendor)}>{payment.vendor.name}</Link>}
        />
        <DetailField label="Jumlah" value={<span className="text-xl">{formatCurrencyExact(Number(payment.amount))}</span>} />
        <DetailField label="Biaya Admin Bank" value={formatCurrencyExact(Number(payment.adminFee))} />
        <DetailField label="Total Keluar dari Bank" value={formatCurrencyExact(Number(payment.amount) + Number(payment.adminFee))} />
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
                <DetailTableTh>No. Tagihan</DetailTableTh>
                <DetailTableTh align="right">Jumlah Alokasi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {payment.allocations.map((alloc) => (
                  <DetailTableRow key={alloc.id}>
                    <DetailTableTd>
                      {alloc.vendorBill ? (
                        <Link
                          href={entityHref("/pembelian/tagihan", alloc.vendorBill)}
                          className="font-medium text-primary hover:underline font-mono"
                        >
                          {alloc.vendorBill.documentNo}
                        </Link>
                      ) : (
                        `Tagihan #${alloc.vendorBillId}`
                      )}
                    </DetailTableTd>
                    <DetailTableTd align="right">{formatCurrencyExact(Number(alloc.amount))}</DetailTableTd>
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
