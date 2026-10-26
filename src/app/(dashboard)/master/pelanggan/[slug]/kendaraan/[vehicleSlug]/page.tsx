export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { Pencil } from "lucide-react"
import { entityHref, entityNestedHref } from "@/lib/utils/entity-url"
import { loadCustomerVehicleContext } from "../_components/load-customer-vehicle"
import { listWarrantyCoveragesByVehicle } from "@/actions/warranty.actions"
import { hasPermission } from "@/lib/auth/permissions"
import { VehicleWarrantyCard } from "@/components/warranty/vehicle-warranty-card"
import { prisma } from "@/lib/db/prisma"
import { getCustomerVehicleHistory, type CustomerVehicleHistoryKind } from "@/lib/reports/customer-vehicle-history-data"
import { InstalledPartsCard } from "@/components/warranty/installed-parts-card"
import { getCustomerVehiclePhotos } from "@/lib/reports/attachment-photo-data"
import {
  CustomerVehiclePhotoPanel,
  isPublishableCategory,
} from "@/components/reports/work-order-photo-panel"
import { PhotoUploadField } from "@/components/reports/photo-upload-field"
import { PhotoVerifyPublishButtons } from "@/components/reports/photo-verify-publish-button"
import { VehicleServiceScheduleForm } from "@/components/reports/vehicle-service-schedule-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kendaraan" }

const HISTORY_KIND: Record<CustomerVehicleHistoryKind, { label: string; basePath: string }> = {
  quotation: { label: "Penawaran", basePath: "/penjualan/penawaran" },
  sales_order: { label: "Pesanan", basePath: "/penjualan/pesanan" },
  sales_invoice: { label: "Faktur", basePath: "/penjualan/faktur" },
  work_order: { label: "Perintah Kerja", basePath: "/produksi/perintah-kerja" },
  project: { label: "Proyek", basePath: "/proyek" },
}

export default async function CustomerVehicleDetailPage({
  params,
}: {
  params: Promise<{ slug: string; vehicleSlug: string }>
}) {
  await requirePermission("view_customers")
  const { slug, vehicleSlug } = await params

  const { customer, customerKey, cv } = await loadCustomerVehicleContext(slug, vehicleSlug)

  // Kartu garansi: cakupan dibaca lewat action existing (izin view terpisah);
  // tanpa izin itu kartu tidak dirender sama sekali, bukan dirender kosong.
  const canViewWarranty = await hasPermission("view_warranty_claims")
  const canRecordRemoval = await hasPermission("edit_warranty_claims")
  const canCreateWarrantyClaim = await hasPermission("create_warranty_claims")

  // F-2026-10-24-096-S: foto kendaraan berkategori dari loader backend.
  const [vehiclePhotos, canEditVehicle, canVerifyPhoto, canPublishPhoto] =
    await Promise.all([
      getCustomerVehiclePhotos(cv.id),
      hasPermission("edit_customers"),
      hasPermission("manage_qc_inspections"),
      hasPermission("complete_work_orders"),
    ])

  const history = await getCustomerVehicleHistory(cv.id, 20, {
    includeInstalledParts: canViewWarranty,
  })
  const warrantyResult = canViewWarranty ? await listWarrantyCoveragesByVehicle(cv.id) : null
  const warrantyCoverages =
    warrantyResult?.success && warrantyResult.coverages ? warrantyResult.coverages : []
  const warrantyClaimCounts = canViewWarranty
    ? await prisma.warrantyClaim.groupBy({
        by: ["coverageId"],
        where: { customerVehicleId: cv.id },
        _count: { _all: true },
      })
    : []
  const claimCountByCoverage = new Map(
    warrantyClaimCounts.map((g) => [g.coverageId, g._count._all]),
  )
  const workOrders = history.entries.filter((e) => e.kind === "work_order")
  const quotations = history.entries.filter((e) => e.kind === "quotation")

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

      <div className="flex flex-wrap items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Detail Kendaraan</h1>
        <div className="flex gap-2">
          <Link href={`${entityNestedHref("/master/pelanggan", customer, "kendaraan", cv)}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">
            <Pencil size={14} /> Ubah
          </Link>
          <Link href={`/master/pelanggan/${customerKey}/kendaraan`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
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

      {/* F-2026-10-25-021-S: jadwal servis berikutnya (aksi edit_customers) */}
      <VehicleServiceScheduleForm
        vehicleId={cv.id}
        nextServiceDate={cv.nextServiceDate}
        nextServiceKm={cv.nextServiceKm}
        nextServiceNote={cv.nextServiceNote}
        lastOdometerKm={cv.lastOdometerKm}
        canEdit={canEditVehicle}
      />

      {/* F-2026-10-24-096-S: foto kendaraan berkategori (loader backend) */}
      <CustomerVehiclePhotoPanel
        photos={vehiclePhotos}
        actions={Object.fromEntries(
          vehiclePhotos.groups.flatMap((g) =>
            g.photos.map((p) => [
              p.id,
              <PhotoVerifyPublishButtons
                key={p.id}
                attachmentId={p.id}
                photoName={p.originalName}
                isVerified={p.isVerified}
                canVerify={canVerifyPhoto}
                canPublish={canPublishPhoto}
                publishable={isPublishableCategory(p.category)}
              />,
            ]),
          ),
        )}
        uploads={
          canEditVehicle ? (
            <div className="border-t border-default pt-4">
              <PhotoUploadField
                referenceType="customer_vehicle"
                referenceId={cv.id}
                parentLabel="Kendaraan pelanggan"
              />
            </div>
          ) : undefined
        }
      />

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
                <div key={wo.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
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

      {/* Garansi kendaraan */}
      {canViewWarranty && (
        <VehicleWarrantyCard
          vehicleId={cv.id}
          vehicleSlug={cv.slug}
          canCreateClaim={canCreateWarrantyClaim}
          coverages={warrantyCoverages.map((c) => ({
            id: c.id,
            itemName: c.item.name,
            itemSku: c.item.sku,
            status: c.status,
            installedAt: c.installedAt,
            expiresAt: c.expiresAt,
            warrantyMonths: c.warrantyMonths,
            mileageLimitKm: c.mileageLimitKm,
            serialNumber: c.serialNumber,
            termsSnapshot: c.termsSnapshot,
            claimCount: claimCountByCoverage.get(c.id) ?? 0,
          }))}
        />
      )}

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
                <div key={q.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
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
      {/* Linimasa */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Linimasa Kendaraan</h2>
        </div>
        <div className="p-4 px-5">
          {/* Seksi part terpasang dari registri (F-072-S §2/AC-IP-9): tanpa izin lihat garansi tidak tampil */}
          {canViewWarranty && (
            <div className="mb-6 border-b border-default pb-6">
              <InstalledPartsCard embedded rows={history.installedParts.rows} canRecordRemoval={canRecordRemoval} />
            </div>
          )}
          {history.entries.length === 0 && (!canViewWarranty || history.installedParts.rows.length === 0) ? (
            <p className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">Belum ada riwayat</p>
          ) : history.entries.length === 0 ? null : (
            <ol className="flex flex-col divide-y divide-default">
              {history.entries.map((entry) => {
                const kind = HISTORY_KIND[entry.kind]
                return (
                  <li key={`${entry.kind}-${entry.id}`} className="flex flex-wrap items-center justify-between gap-4 py-3">
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kind.label}</span>
                      <Link href={entityHref(kind.basePath, entry)} className="font-mono text-sm text-primary hover:underline">
                        {entry.documentNo}
                      </Link>
                    </span>
                    <span className="flex flex-wrap items-center gap-3">
                      {entry.grandTotal !== null && (
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {formatCurrency(entry.grandTotal)} · Terbayar {formatCurrency(entry.paidAmount ?? 0)}
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">{formatDate(entry.date)}</span>
                      <StatusChip status={entry.status} />
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
