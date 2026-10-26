/**
 * Loader read-only antrean permintaan material draft mengendap
 * (F-2026-10-26-071-S tahap 1, tanpa migrasi/kolom baru).
 *
 * Fail-closed SEBELUM query (BR-MRQ-04): izin `view_material_requests`
 * ditegakkan di sini, lalu `getWarehouseScope` — scope `none` BUKAN
 * populasi antrean dan jatuh kosong sebelum query. Scope KEDUA sisi
 * (PUTUSAN LEAD Q-MRQ-4): baris masuk bila `requesterWarehouseId`
 * ATAU `sourceWarehouseId` dalam scope pembaca.
 *
 * MaterialRequest TIDAK punya deletedAt (schema) — populasi cukup
 * `status: "draft"` persis (BR-MRQ-01); builder menyaring ulang status
 * lapis kedua. Anti-N+1: satu query MaterialRequest (+relasi gudang
 * kedua sisi, WO, qty item) + satu query User massal nama pembuat —
 * BUKAN query per baris (AC-MRQ-B4). Select daftar-putih TANPA harga
 * (BR-MRQ-05): permintaan bukan dokumen nilai.
 *
 * Baca-saja mutlak (BR-MRQ-08, AC-MRQ-B5): loader hanya `findMany`;
 * tidak memanggil submit/approve/delete/createTransfer/hook stok.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import {
  buildMaterialRequestDraftQueue,
  type MaterialRequestDraftInput,
  type MaterialRequestDraftQueue,
} from "@/lib/reports/material-request-draft-queue"

export interface MaterialRequestDraftQueueOptions {
  /** Tanggal laporan untuk umur hari (diinjeksikan; default sekarang). */
  now?: Date
}

const EMPTY_QUEUE: MaterialRequestDraftQueue = {
  rows: [],
  levelCounts: { mengendap: 0, menunggu: 0 },
  requesterWarehouseCounts: [],
  sourceWarehouseCounts: [],
  totalDocuments: 0,
}

export async function getMaterialRequestDraftQueue(
  options: MaterialRequestDraftQueueOptions = {},
): Promise<MaterialRequestDraftQueue> {
  const user = await requirePermission("view_material_requests")
  const scope = await getWarehouseScope(user)

  // Scope none bukan populasi antrean (BR-MRQ-04) — fail-closed
  // kosong sebelum query, termasuk rekap count (AC-MRQ-B1).
  if (scope.kind === "none") return EMPTY_QUEUE

  const scopedWhere =
    scope.kind === "all"
      ? {}
      : {
          OR: [
            { requesterWarehouseId: { in: scope.warehouseIds } },
            { sourceWarehouseId: { in: scope.warehouseIds } },
          ],
        }

  const requests = await prisma.materialRequest.findMany({
    where: { status: "draft", ...scopedWhere },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      requesterWarehouseId: true,
      sourceWarehouseId: true,
      workOrderId: true,
      neededBy: true,
      createdBy: true,
      createdAt: true,
      requesterWarehouse: { select: { name: true } },
      sourceWarehouse: { select: { name: true } },
      workOrder: { select: { documentNo: true } },
      items: { select: { qty: true } },
    },
    orderBy: [{ createdAt: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const creatorIds = [
    ...new Set(requests.map((r) => r.createdBy).filter((id): id is number => id != null)),
  ]
  const creators =
    creatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        })
      : []
  const creatorNameById = new Map(creators.map((u) => [u.id, u.name]))

  const inputs: MaterialRequestDraftInput[] = requests.map((r) => ({
    materialRequestId: r.id,
    slug: r.slug,
    documentNo: r.documentNo,
    status: r.status,
    requesterWarehouseId: r.requesterWarehouseId,
    requesterWarehouseName: r.requesterWarehouse.name,
    sourceWarehouseId: r.sourceWarehouseId,
    sourceWarehouseName: r.sourceWarehouse.name,
    workOrderId: r.workOrderId,
    workOrderDocumentNo: r.workOrder?.documentNo ?? null,
    neededBy: r.neededBy,
    createdByName: r.createdBy != null ? (creatorNameById.get(r.createdBy) ?? null) : null,
    createdAt: r.createdAt,
    itemCount: r.items.length,
    totalQty: r.items.reduce((sum, item) => sum + Number(item.qty), 0),
  }))

  return buildMaterialRequestDraftQueue(inputs, options.now ?? new Date())
}
