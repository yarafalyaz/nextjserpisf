export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteSalesPayment } from "@/actions/sales.actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"

export default async function SalesPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const payment = await prisma.salesPayment.findUnique({
    where: { id: Number(id) },
    include: {
      salesInvoice: { include: { customer: true } },
    },
  })

  if (!payment) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pembayaran ${payment.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Sales", href: "/penjualan" },
          { label: "Payments", href: "/penjualan/pembayaran" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/penjualan/pembayaran/${payment.id}/edit`} variant="primary">Ubah</Button>
            <PrintButton />
            <DeleteButton id={payment.id} action={deleteSalesPayment} />
            <BackButton href="/penjualan/pembayaran" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={payment.documentNo} mono />
        <DetailField
          label="Faktur"
          value={<Link href={`/penjualan/faktur/${payment.salesInvoice.id}`}>{payment.salesInvoice.documentNo}</Link>}
        />
        <DetailField
          label="Pelanggan"
          value={<Link href={`/master/pelanggan/${payment.salesInvoice.customer.id}`}>{payment.salesInvoice.customer.name}</Link>}
        />
        <DetailField label="Jumlah" value={<span className="text-xl">{formatCurrency(Number(payment.amount))}</span>} />
        <DetailField label="Tanggal Bayar" value={formatDate(payment.paymentDate)} />
        <DetailField label="Metode Pembayaran" value={payment.paymentMethod} />
        <DetailField label="Dibuat" value={formatDate(payment.createdAt)} />
      </DetailCard>

      {/* Notes */}
      {payment.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={payment.notes} colSpan="full" />
        </DetailCard>
      )}

      <TransactionAttachments referenceType="sales_payment" referenceId={payment.id} />
    </div>
  )
}
