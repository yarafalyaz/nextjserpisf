export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteDeliveryOrder } from "@/actions/sales.actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function DeliveryOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const deliveryOrder = await prisma.deliveryOrder.findUnique({
    where: { id: Number(id) },
    include: {
      salesOrder: { include: { customer: true } },
    },
  })

  if (!deliveryOrder) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Surat Jalan",href:"/penjualan/surat-jalan"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Surat Jalan {deliveryOrder.documentNo}</h1>
        <div className="flex gap-2 items-center">
          <span className={`status-badge status-${deliveryOrder.status}`}>{deliveryOrder.status}</span>
  <div className="flex gap-2">
          <Link href={`/penjualan/surat-jalan/${deliveryOrder.id}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Ubah</Link>
          <PrintButton />
          <DeleteButton id={deliveryOrder.id} action={deleteDeliveryOrder} />
                  <Link href="/penjualan/surat-jalan" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{deliveryOrder.documentNo}</span>
          </div>
          {deliveryOrder.doNumber && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No. DO</span>
              <span className="text-[0.9375rem] text-foreground font-medium font-mono">{deliveryOrder.doNumber}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pesanan Penjualan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/penjualan/pesanan/${deliveryOrder.salesOrder.id}`}>{deliveryOrder.salesOrder.documentNo}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pelanggan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/master/pelanggan/${deliveryOrder.salesOrder.customer.id}`}>{deliveryOrder.salesOrder.customer.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(deliveryOrder.date)}</span>
          </div>
          {deliveryOrder.deliveryDate && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tanggal Pengiriman</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(deliveryOrder.deliveryDate)}</span>
            </div>
          )}
          {deliveryOrder.shippingPhone && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Telepon Penerima</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{deliveryOrder.shippingPhone}</span>
            </div>
          )}
          {deliveryOrder.vehicleNumber && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No. Kendaraan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{deliveryOrder.vehicleNumber}</span>
            </div>
          )}
          {deliveryOrder.confirmedBy && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dikonfirmasi Oleh</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{deliveryOrder.confirmedBy}</span>
            </div>
          )}
          {deliveryOrder.confirmedAt && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dikonfirmasi Pada</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(deliveryOrder.confirmedAt)}</span>
            </div>
          )}
          {deliveryOrder.deliveredAt && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dikirim Pada</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(deliveryOrder.deliveredAt)}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(deliveryOrder.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {deliveryOrder.notes && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Catatan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{deliveryOrder.notes}</span>
          </div>
        </div>
      )}
    </div>
  )
}
