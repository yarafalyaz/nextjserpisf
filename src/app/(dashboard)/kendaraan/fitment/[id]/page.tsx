export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicleFitment } from "@/actions/vehicle-fitment.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"

export const metadata: Metadata = { title: "Fitment Kendaraan" }

const RESULT_LABEL: Record<string, string> = {
  compatible: "Cocok",
  incompatible: "Tidak Cocok",
  unknown: "Belum Diketahui",
}

const RESULT_CLASS: Record<string, string> = {
  compatible: "bg-success/10 text-success",
  incompatible: "bg-danger/10 text-danger",
  unknown: "bg-muted text-muted-foreground",
}

export default async function VehicleFitmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_vehicle_fitments")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const rule = await prisma.vehicleFitmentRule.findUnique({ where: { id: numId } })
  if (!rule) notFound()

  const [item, brand, model, variant, bomRevision] = await Promise.all([
    prisma.item.findUnique({ where: { id: rule.itemId }, select: { id: true, sku: true, name: true } }),
    rule.vehicleBrandId != null ? prisma.vehicleBrand.findUnique({ where: { id: rule.vehicleBrandId }, select: { id: true, name: true } }) : null,
    rule.vehicleModelId != null ? prisma.vehicleModel.findUnique({ where: { id: rule.vehicleModelId }, select: { id: true, name: true } }) : null,
    rule.vehicleVariantId != null ? prisma.vehicleVariant.findUnique({ where: { id: rule.vehicleVariantId }, select: { id: true, name: true } }) : null,
    rule.bomRevisionId != null ? prisma.bomRevision.findUnique({ where: { id: rule.bomRevisionId }, select: { id: true, revisionNo: true } }) : null,
  ])

  const canEdit = await hasPermission("edit_vehicle_fitments")
  const canDelete = await hasPermission("delete_vehicle_fitments")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Aturan Fitment #${rule.id}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Kendaraan", href: "/kendaraan" },
          { label: "Fitment", href: "/kendaraan/fitment" },
          { label: "Detail" },
        ]}
        badge={
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${RESULT_CLASS[rule.result] ?? RESULT_CLASS.unknown}`}>
            {RESULT_LABEL[rule.result] ?? rule.result}
          </span>
        }
        actions={
          <>
            {canEdit && (
              <Button href={`/kendaraan/fitment/${rule.id}/ubah`} variant="primary">Ubah</Button>
            )}
            {canDelete && <DeleteButton id={rule.id} action={deleteVehicleFitment} />}
            <BackButton href="/kendaraan/fitment" />
          </>
        }
      />

      <DetailCard>
        <DetailField
          label="Item / SKU"
          value={
            item ? (
              <Link href={`/master/barang/${item.id}`} className="hover:underline">
                <span className="font-mono text-xs text-muted-foreground mr-1.5">{item.sku}</span>
                {item.name}
              </Link>
            ) : `Item #${rule.itemId}`
          }
        />
        <DetailField
          label="Revisi BOM"
          value={
            bomRevision ? (
              <Link href={`/produksi/bom-revisi/${bomRevision.id}`} className="hover:underline">
                Rev. {bomRevision.revisionNo}
              </Link>
            ) : "Semua revisi"
          }
        />
        <DetailField label="Merek" value={brand?.name ?? "Semua merek"} />
        <DetailField label="Model" value={model?.name ?? "Semua model"} />
        <DetailField label="Varian" value={variant?.name ?? "Semua varian"} />
        <DetailField
          label="Rentang Tahun"
          value={
            rule.yearFrom != null || rule.yearTo != null
              ? `${rule.yearFrom ?? "…"} – ${rule.yearTo ?? "…"}`
              : "-"
          }
        />
        <DetailField label="Penggerak" value={rule.drivetrain || "-"} />
        <DetailField label="Transmisi" value={rule.transmission || "-"} />
        <DetailField label="Status Aktif" value={rule.isActive ? "Aktif" : "Nonaktif"} />
        <DetailField label="Dibuat" value={formatDate(rule.createdAt)} />
        <DetailField label="Sumber" value={rule.source || "-"} colSpan="full" />
        <DetailField label="Catatan" value={rule.notes || "-"} colSpan="full" />
      </DetailCard>

      <p className="text-sm text-muted-foreground">
        Aturan yang lebih spesifik (varian &gt; model &gt; merek) menang saat pengecekan
        kompatibilitas. <Link href="/kendaraan/fitment" className="text-primary hover:underline">Kembali ke daftar</Link>.
      </p>
    </div>
  )
}
