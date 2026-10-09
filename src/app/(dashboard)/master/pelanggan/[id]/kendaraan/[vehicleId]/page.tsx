export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { Pencil } from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kendaraan" }

export default async function CustomerVehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string; vehicleId: string }>
}) {
  await requirePermission("view_customers")
  const { id, vehicleId } = await params
  const customerId = Number(id)
  const customerVehicleId = Number(vehicleId)

  if (
    !Number.isInteger(customerId) ||
    customerId <= 0 ||
    !Number.isInteger(customerVehicleId) ||
    customerVehicleId <= 0
  ) {
    notFound()
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId, deletedAt: null },
  })

  if (!customer) notFound()

  const cv = await prisma.customerVehicle.findUnique({
    where: { id: customerVehicleId },
    include: {
      vehicle: {
        include: {
          variant: {
            include: {
              model: {
                include: { brand: true },
              },
            },
          },
        },
      },
    },
  })

  if (!cv || cv.customerId !== customerId) notFound()

  const [workOrders, quotations] = await Promise.all([
    prisma.workOrder.findMany({
      where: { customerVehicleId: customerVehicleId },
      select: { id: true, documentNo: true, date: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.quotation.findMany({
      where: { customerVehicleId: customerVehicleId },
      select: { id: true, documentNo: true, date: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ])

  const brandName = cv.vehicle?.variant?.model?.brand?.name || "-"
  const modelName = cv.vehicle?.variant?.model?.name || "-"
  const variantName = cv.vehicle?.variant?.name || "-"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Pelanggan", href: "/master/pelanggan" },
        { label: customer.name, href: `/master/pelanggan/${id}` },
        { label: "Kendaraan", href: `/master/pelanggan/${id}/kendaraan` },
        { label: "Detail" },
      ]} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Detail Kendaraan</h1>
        <div className="flex gap-2">
          <Link href={`/master/pelanggan/${id}/kendaraan/${vehicleId}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">
            <Pencil size={14} /> Ubah
          </Link>
          <Link href={`/master/pelanggan/${id}/kendaraan`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Merek</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{brandName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Model</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{modelName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Varian</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{variantName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plat Nomor</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{cv.vehicle?.plateNumber || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tahun</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.vehicle?.year || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Warna</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.vehicle?.color || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipe Kendaraan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.vehicleType || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transmisi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.transmission || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No. Rangka</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{cv.chassisNumber || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No. Mesin</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{cv.engineNumber || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={cv.isActive ? "active" : "inactive"} /></span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(cv.createdAt)}</span>
          </div>
          {cv.notes && (
            <div className="flex flex-col gap-1 col-span-full">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Catatan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{cv.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Work Orders */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Perintah Kerja</h2>
        </div>
        <div className="p-4 px-5">
          {workOrders.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">Belum ada perintah kerja</p>
          ) : (
            <div className="flex flex-col divide-y divide-default">
              {workOrders.map((wo) => (
                <div key={wo.id} className="flex items-center justify-between gap-4 py-3">
                  <Link href={`/produksi/perintah-kerja/${wo.id}`} className="font-mono text-sm text-primary hover:underline">
                    {wo.documentNo}
                  </Link>
                  <span className="text-sm text-muted-foreground">{formatDate(wo.date)}</span>
                  <StatusChip status={wo.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quotations */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Penawaran</h2>
        </div>
        <div className="p-4 px-5">
          {quotations.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">Belum ada penawaran</p>
          ) : (
            <div className="flex flex-col divide-y divide-default">
              {quotations.map((q) => (
                <div key={q.id} className="flex items-center justify-between gap-4 py-3">
                  <Link href={`/penjualan/penawaran/${q.id}`} className="font-mono text-sm text-primary hover:underline">
                    {q.documentNo}
                  </Link>
                  <span className="text-sm text-muted-foreground">{formatDate(q.date)}</span>
                  <StatusChip status={q.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
