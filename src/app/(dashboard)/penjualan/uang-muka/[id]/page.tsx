export const dynamic = "force-dynamic"

import Image from "next/image"
import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteDownPayment } from "@/actions/sales.actions"
import { StatusChip } from "@/components/ui/status-chip"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { getPaymentMethodMap, resolvePaymentMethodName } from "@/lib/services/method.service"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Uang Muka" }

export default async function DownPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_sales_orders")

  const { id } = await params

  const dp = await prisma.downPayment.findUnique({
    where: { id: Number(id) },
    include: {
      quotation: true,
      customer: true,
    },
  })

  if (!dp) notFound()

  const pmMap = await getPaymentMethodMap()

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
            <Button href={`/penjualan/uang-muka/${dp.id}/ubah`} variant="primary">Ubah</Button>
            {dp.status === "paid" && (
              <Button href={`/produksi/perintah-kerja/tambah?penawaranId=${dp.quotationId}`} variant="primary">+ Perintah Kerja</Button>
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
          label="Pelanggan"
          value={<Link href={`/master/pelanggan/${dp.customer.id}`}>{dp.customer.name}</Link>}
        />
        <DetailField
          label="Penawaran"
          value={<Link href={`/penjualan/penawaran/${dp.quotation.id}`}>{dp.quotation.documentNo}</Link>}
        />
        <DetailField label="Jumlah" value={<span className="text-xl">{formatCurrency(Number(dp.amount))}</span>} />
        <DetailField label="Tanggal Bayar" value={formatDate(dp.paymentDate)} />
        <DetailField label="Metode Pembayaran" value={resolvePaymentMethodName(dp.paymentMethod, pmMap)} />
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

      {/* Notes */}
      {dp.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={dp.notes} colSpan="full" />
        </DetailCard>
      )}
    </div>
  )
}
