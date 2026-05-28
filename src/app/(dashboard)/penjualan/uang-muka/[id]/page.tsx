export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteDownPayment } from "@/actions/sales.actions"
import { StatusChip } from "@/components/ui/status-chip"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

export default async function DownPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const dp = await prisma.downPayment.findUnique({
    where: { id: Number(id) },
    include: {
      quotation: true,
      customer: true,
    },
  })

  if (!dp) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Down Payment ${dp.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Sales", href: "/penjualan" },
          { label: "Down Payments", href: "/penjualan/uang-muka" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={dp.status} />}
        actions={
          <>
            <Button href={`/penjualan/uang-muka/${dp.id}/edit`} variant="primary">Edit</Button>
            {dp.status === "paid" && (
              <Button href={`/produksi/perintah-kerja/create?penawaranId=${dp.quotationId}`} variant="primary">+ Work Order</Button>
            )}
            <PrintButton />
            <DeleteButton id={dp.id} action={deleteDownPayment} />
            <BackButton href="/penjualan/uang-muka" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={dp.documentNo} mono />
        <DetailField
          label="Customer"
          value={<Link href={`/master/pelanggan/${dp.customer.id}`}>{dp.customer.name}</Link>}
        />
        <DetailField
          label="Quotation"
          value={<Link href={`/penjualan/penawaran/${dp.quotation.id}`}>{dp.quotation.documentNo}</Link>}
        />
        <DetailField label="Jumlah" value={<span className="text-xl">{formatCurrency(Number(dp.amount))}</span>} />
        <DetailField label="Tanggal Bayar" value={formatDate(dp.paymentDate)} />
        <DetailField label="Metode Pembayaran" value={dp.paymentMethod || "-"} />
        <DetailField label="Dibuat" value={formatDate(dp.createdAt)} />
      </DetailCard>

      {/* Proof Image */}
      {dp.proofImage && (
        <DetailCard>
          <DetailField
            label="Bukti Pembayaran"
            value={<img src={dp.proofImage} alt="Bukti pembayaran" className="max-w-[400px] rounded-lg" />}
            colSpan="full"
          />
        </DetailCard>
      )}

      {/* Notes */}
      {dp.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={dp.notes} colSpan="full" />
        </DetailCard>
      )}
    </div>
  )
}
