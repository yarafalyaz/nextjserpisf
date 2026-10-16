export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { Pencil } from "lucide-react"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref } from "@/lib/utils/entity-url"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kendaraan" }

export default async function CustomerVehicleDetailPage({
  params,
}: {
  params: Promise<{ slug: string; vehicleSlug: string }>
}) {
  await requirePermission("view_customers")
  const { slug, vehicleSlug } = await params

  const customer = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.customer.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.customer.findUnique({ where: { id, ...where } }),
    },
  )

  if (!customer) notFound()

  const customerId = customer.id
  const customerKey = customer.slug ?? customer.id

  const cvInclude = {
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
  } as const

  // Slug lebih dulu; id numerik tetap diterima untuk tautan lama. Cakupannya
  // dibatasi ke pelanggan di slug induk, supaya satu unit tidak bisa dibuka
  // lewat pelanggan lain.
  const cv = await resolveEntity(
    { segment: vehicleSlug, fallbackWhere: { customerId: customer.id } },
    {
      bySlug: (s, where) => prisma.customerVehicle.findFirst({ where: { slug: s, ...where }, include: cvInclude }),
      byId: (id, where) => prisma.customerVehicle.findFirst({ where: { id, ...where }, include: cvInclude }),
    },
  )

  if (!cv || cv.customerId !== customerId) notFound()

  const [workOrders, quotations] = await Promise.all([
    prisma.workOrder.findMany({
      where: { customerVehicleId: cv.id },
      select: { id: true, slug: true, documentNo: true, date: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.quotation.findMany({
      where: { customerVehicleId: cv.id },
      select: { id: true, slug: true, documentNo: true, date: true, status: true },
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
        { label: "Data Master", href: "/master" },
        { label: "Pelanggan", href: "/master/pelanggan" },
        { label: customer.name, href: `/master/pelanggan/${customerKey}` },
        { label: "Kendaraan", href: `/master/pelanggan/${customerKey}/kendaraan` },
        { label: "Detail" },
      ]} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Detail Kendaraan</h1>
        <div className="flex gap-2">
          <Link href={`/master/pelanggan/${customerKey}/kendaraan/${cv.slug ?? cv.id}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">
            <Pencil size={14} /> Ubah
          </Link>
          <Link href={`/master/pelanggan/${customerKey}/kendaraan`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
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
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{cv.plateNumber || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tahun</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.vehicle?.year || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Warna</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.color || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transmisi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{cv.vehicle?.variant?.transmission || "-"}</span>
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
                  <Link href={entityHref("/produksi/perintah-kerja", wo)} className="font-mono text-sm text-primary hover:underline">
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
                  <Link href={entityHref("/penjualan/penawaran", q)} className="font-mono text-sm text-primary hover:underline">
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
