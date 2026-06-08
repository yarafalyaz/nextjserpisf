export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVendorPayment } from "@/actions/purchase.actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { getPaymentMethodMap, resolvePaymentMethodName } from "@/lib/services/method.service"

export default async function VendorPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const payment = await prisma.vendorPayment.findUnique({
    where: { id: Number(id) },
    include: {
      vendor: true,
      allocations: true,
    },
  })

  if (!payment) notFound()

  const pmMap = await getPaymentMethodMap()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pembayaran Vendor ${payment.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Pembayaran Vendor", href: "/pembelian/pembayaran-vendor" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/pembelian/pembayaran-vendor/${payment.id}/ubah`} variant="primary">Ubah</Button>
            <PrintButton />
            <DeleteButton id={payment.id} action={deleteVendorPayment} />
            <BackButton href="/pembelian/pembayaran-vendor" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={payment.documentNo} mono />
        <DetailField
          label="Pemasok"
          value={<Link href={`/master/pemasok/${payment.vendor.id}`}>{payment.vendor.name}</Link>}
        />
        <DetailField label="Jumlah" value={<span className="text-xl">{formatCurrency(Number(payment.amount))}</span>} />
        <DetailField label="Tanggal Bayar" value={formatDate(payment.paymentDate)} />
        <DetailField label="Metode Pembayaran" value={resolvePaymentMethodName(payment.paymentMethod, pmMap)} />
        <DetailField label="Dibuat" value={formatDate(payment.createdAt)} />
      </DetailCard>

      {/* Allocations */}
      {payment.allocations.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
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
