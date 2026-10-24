/**
 * Loader read-only saran substitusi part per baris WO
 * (F-2026-10-22-069-S). Merakit dari read-model EXISTING — dilarang
 * agregasi stok/status kedua (AC-SUB69-2):
 *
 * - status + issued per baris: getWorkOrderPartStatus (builder
 *   work-order-part-status);
 * - stok efektif + shortage per item: getWorkOrderMaterialNeeds
 *   (builder work-order-material-needs; tersedia efektif sudah
 *   dikurangi committed WO lain);
 * - relasi substitusi AKTIF langsung untuk item baris yang layak;
 * - fitment pengganti ke kendaraan WO: evaluateFitment service
 *   existing (WO tanpa kendaraan => semua `unknown`, Q-SUB69-2).
 *
 * Stok efektif PENGGANTI dihitung dengan rumus builder yang sama
 * (qtyOnHand - committed WO aktif lain) lewat satu query massal
 * tambahan untuk item pengganti — bukan per baris. Tanpa mutasi.
 */

import { prisma } from "@/lib/db/prisma"
import { getWorkOrderPartStatus } from "@/lib/reports/work-order-part-status-data"
import { getWorkOrderMaterialNeeds } from "@/lib/reports/work-order-material-needs-data"
import {
  buildSubstituteSuggestions,
  isSubstituteSuggestionEligible,
  type SubstituteCandidateInput,
  type SubstituteSuggestionReport,
} from "@/lib/reports/item-substitute-suggestions"
import {
  configurationFromCustomerVehicle,
  evaluateFitment,
  type FitmentResult,
} from "@/lib/services/vehicle-fitment.service"
import { ACTIVE_WORK_ORDER_STATUSES } from "@/lib/reports/work-order-queue"

export async function getWorkOrderSubstituteSuggestions(
  workOrderId: number,
): Promise<SubstituteSuggestionReport | null> {
  const [partStatus, materialNeeds, wo] = await Promise.all([
    getWorkOrderPartStatus(workOrderId),
    getWorkOrderMaterialNeeds(workOrderId),
    prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, customerVehicleId: true, bomRevisionId: true },
    }),
  ])
  if (!partStatus || !materialNeeds || !wo) return null

  const shortageByItem = new Map(
    materialNeeds.lines.map((line) => [line.itemId, line.shortageQty]),
  )
  const lines = partStatus.rows.map((row) => ({
    workOrderItemId: row.workOrderItemId,
    itemId: row.itemId,
    description: row.description,
    qty: row.qty,
    partStatus: row.status,
    issuedQty: row.issuedQty,
    shortageQty: shortageByItem.get(row.itemId) ?? 0,
  }))

  const eligibleItemIds = [
    ...new Set(
      lines.filter((line) => isSubstituteSuggestionEligible(line)).map((line) => line.itemId),
    ),
  ]
  if (eligibleItemIds.length === 0) {
    return buildSubstituteSuggestions({ lines, candidates: [] })
  }

  const relations = await prisma.itemSubstitute.findMany({
    where: { itemId: { in: eligibleItemIds }, isActive: true },
    select: {
      id: true,
      itemId: true,
      substituteItemId: true,
      notes: true,
      substituteItem: {
        select: {
          id: true,
          name: true,
          sku: true,
          unitOfMeasure: true,
          qtyOnHand: true,
          isActive: true,
          deletedAt: true,
          isService: true,
        },
      },
    },
    orderBy: { id: "asc" },
  })
  // Pengganti yang sejak relasi dibuat menjadi nonaktif/terhapus/jasa
  // tidak ditawarkan (BR-SUB69-01 dibaca ulang saat saran, bukan hanya
  // saat relasi ditulis).
  const usable = relations.filter(
    (rel) =>
      rel.substituteItem.isActive &&
      rel.substituteItem.deletedAt == null &&
      !rel.substituteItem.isService,
  )
  if (usable.length === 0) {
    return buildSubstituteSuggestions({ lines, candidates: [] })
  }

  const substituteIds = [...new Set(usable.map((rel) => rel.substituteItemId))]

  // Tersedia efektif pengganti: pola material-needs (qtyOnHand -
  // committed WO aktif lain). Satu query massal WO aktif + MI completed
  // untuk item pengganti, bukan per baris dan bukan agregasi stok kedua
  // untuk baris WO ini sendiri.
  const [otherWorkOrders] = await Promise.all([
    prisma.workOrder.findMany({
      where: {
        id: { not: workOrderId },
        status: { in: [...ACTIVE_WORK_ORDER_STATUSES] },
      },
      select: {
        id: true,
        items: {
          where: { itemId: { in: substituteIds } },
          select: { itemId: true, qty: true, status: true },
        },
      },
    }),
  ])
  const committedByItem = new Map<number, number>()
  if (otherWorkOrders.length > 0) {
    const otherIssues = await prisma.materialIssue.findMany({
      where: {
        workOrderId: { in: otherWorkOrders.map((w) => w.id) },
        status: "completed",
      },
      select: {
        workOrderId: true,
        items: {
          where: { itemId: { in: substituteIds } },
          select: { itemId: true, qty: true },
        },
      },
    })
    const issuedByWoItem = new Map<string, number>()
    for (const issue of otherIssues) {
      for (const row of issue.items) {
        const key = `${issue.workOrderId}:${row.itemId}`
        issuedByWoItem.set(key, (issuedByWoItem.get(key) ?? 0) + Number(row.qty))
      }
    }
    for (const other of otherWorkOrders) {
      for (const line of other.items) {
        if (line.status === "replaced" || line.itemId <= 0) continue
        const remaining = Math.max(
          0,
          Number(line.qty) - (issuedByWoItem.get(`${other.id}:${line.itemId}`) ?? 0),
        )
        if (remaining > 0) {
          committedByItem.set(line.itemId, (committedByItem.get(line.itemId) ?? 0) + remaining)
        }
      }
    }
  }

  const configuration = wo.customerVehicleId
    ? await configurationFromCustomerVehicle(prisma, wo.customerVehicleId)
    : null

  const candidates: SubstituteCandidateInput[] = []
  for (const rel of usable) {
    let fitment: FitmentResult = "unknown"
    let fitmentReason = "Tidak ada aturan fitment yang cocok; kompatibilitas belum diketahui."
    if (configuration) {
      const evaluation = await evaluateFitment(prisma, {
        itemId: rel.substituteItemId,
        bomRevisionId: wo.bomRevisionId,
        configuration,
      })
      fitment = evaluation.result
      fitmentReason = evaluation.reason
    }
    const onHand = Number(rel.substituteItem.qtyOnHand)
    candidates.push({
      substituteId: rel.id,
      itemId: rel.itemId,
      substituteItemId: rel.substituteItemId,
      substituteName: rel.substituteItem.name,
      substituteSku: rel.substituteItem.sku,
      substituteUnitOfMeasure: rel.substituteItem.unitOfMeasure,
      notes: rel.notes,
      effectiveAvailableQty: Math.max(0, onHand - (committedByItem.get(rel.substituteItemId) ?? 0)),
      fitment,
      fitmentReason,
    })
  }

  return buildSubstituteSuggestions({ lines, candidates })
}
