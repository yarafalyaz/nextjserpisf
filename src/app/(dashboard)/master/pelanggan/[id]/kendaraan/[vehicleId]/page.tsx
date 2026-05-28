export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { Pencil } from "lucide-react"

export default async function CustomerVehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string; kendaraanId: string }>
}) {
  await requirePermission("view_customers")
  const { id, kendaraanId } = await params

  const customer = await prisma.customer.findUnique({
    where: { id: Number(id), deletedAt: null },
  })

  if (!customer) notFound()

  const cv = await prisma.customerVehicle.findUnique({
    where: { id: Number(kendaraanId) },
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

  if (!cv || cv.customerId !== Number(id)) notFound()

  const brandName = cv.vehicle?.variant?.model?.brand?.name || "-"
  const modelName = cv.vehicle?.variant?.model?.name || "-"
  const variantName = cv.vehicle?.variant?.name || "-"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Customers", href: "/master/pelanggan" },
        { label: customer.name, href: `/master/pelanggan/${id}` },
        { label: "Kendaraan", href: `/master/pelanggan/${id}/kendaraan` },
        { label: "Detail" },
      ]} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Detail Kendaraan</h1>
        <div className="flex gap-2">
          <Link href={`/master/pelanggan/${id}/kendaraan/${kendaraanId}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">
            <Pencil size={14} /> Edit
          </Link>
          <Link href={`/master/pelanggan/${id}/kendaraan`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Brand</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{brandName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Model</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{modelName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Varian</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{variantName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Plat Nomor</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{cv.licensePlate || cv.vehicle?.plateNumber || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tahun</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.year || cv.vehicle?.year || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Warna</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.color || cv.vehicle?.color || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tipe Kendaraan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.vehicleType || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Transmisi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.transmission || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Rangka</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{cv.chassisNumber || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Mesin</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{cv.engineNumber || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={cv.isActive ? "active" : "inactive"} /></span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(cv.createdAt)}</span>
          </div>
          {cv.notes && (
            <div className="flex flex-col gap-1 col-span-full">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{cv.notes}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
