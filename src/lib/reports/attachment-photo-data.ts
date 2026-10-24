import "server-only"
import { prisma } from "@/lib/db/prisma"
import {
  groupPhotosByParent,
  pairBeforeAfter,
  type GroupedPhotos,
  type PhotoAttachmentRow,
} from "./attachment-photo"

/**
 * F-2026-10-24-096-S — loader read-model foto (server-only).
 * Kontrak untuk BOT Frontend: panel foto per tahap di detail WO dan
 * kendaraan pelanggan. Izin per induk ditegakkan route lampiran +
 * canAccessAttachment saat berkas disajikan; loader ini hanya membaca
 * baris yang sudah lolos halaman induknya (view_work_orders/view_projects/
 * view_customers sesuai halaman pemanggil).
 *
 * BR-PHOTO-04/10: loader murni baca — tidak mengubah progres/status/biaya.
 */

const PHOTO_PARENTS_FOR_WORK_ORDER = [
  "work_order",
  "work_order_operation",
  "qc_inspection",
  "project_stage",
] as const

const photoSelect = {
  id: true,
  referenceType: true,
  referenceId: true,
  originalName: true,
  fileUrl: true,
  mimeType: true,
  photoCategory: true,
  verifiedBy: true,
  verifiedAt: true,
  publishedBy: true,
  publishedAt: true,
  uploadedBy: true,
  createdAt: true,
} as const

async function loadRows(where: Record<string, unknown>): Promise<PhotoAttachmentRow[]> {
  return prisma.transactionAttachment.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 500,
    select: photoSelect,
  })
}

/** Foto satu WO: menempel langsung + operasi + inspeksi QC WO itu. */
export async function getWorkOrderPhotos(workOrderId: number): Promise<GroupedPhotos & ReturnType<typeof pairBeforeAfter>> {
  const [operations, inspections] = await Promise.all([
    prisma.workOrderOperation.findMany({ where: { workOrderId }, select: { id: true, name: true } }),
    prisma.qcInspection.findMany({
      where: { referenceType: "WorkOrder", referenceId: workOrderId },
      select: { id: true, inspectionType: true, documentNo: true },
    }),
  ])
  const labels: Record<string, string> = { [`work_order:${workOrderId}`]: "Perintah kerja" }
  for (const op of operations) labels[`work_order_operation:${op.id}`] = op.name
  for (const qc of inspections) labels[`qc_inspection:${qc.id}`] = `${qc.documentNo} (${qc.inspectionType})`

  const parents: { referenceType: string; referenceId: number }[] = [
    { referenceType: "work_order", referenceId: workOrderId },
    ...operations.map((op) => ({ referenceType: "work_order_operation", referenceId: op.id })),
    ...inspections.map((qc) => ({ referenceType: "qc_inspection", referenceId: qc.id })),
  ]
  const rows = parents.length
    ? await loadRows({ OR: parents.map((p) => ({ referenceType: p.referenceType, referenceId: p.referenceId })) })
    : []
  void PHOTO_PARENTS_FOR_WORK_ORDER
  return { ...groupPhotosByParent(rows, labels), ...pairBeforeAfter(rows) }
}

/** Foto satu kendaraan pelanggan (umum + inspeksi/WO tidak dicampur di sini). */
export async function getCustomerVehiclePhotos(customerVehicleId: number): Promise<GroupedPhotos> {
  const rows = await loadRows({ referenceType: "customer_vehicle", referenceId: customerVehicleId })
  return groupPhotosByParent(rows, { [`customer_vehicle:${customerVehicleId}`]: "Kendaraan pelanggan" })
}

/** Read-model pelanggan kelak (INT-04C): HANYA foto terbit (BR-PHOTO-08). */
export async function getPublishedVehiclePhotos(customerVehicleId: number): Promise<GroupedPhotos["published"]> {
  const grouped = await getCustomerVehiclePhotos(customerVehicleId)
  return grouped.published
}
