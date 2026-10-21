/**
 * Loader read-only fitment per dokumen (F-2026-10-21-023 lapis aman).
 *
 * Satu kendaraan dokumen (Quotation.customerVehicleId /
 * WorkOrder.customerVehicleId) → konfigurasi dari rantai master, lalu
 * aturan fitment aktif untuk item baris dokumen dimuat massal (satu
 * query per sumber, tanpa N+1) dan dievaluasi builder murni
 * `fitment-for-document.ts`.
 *
 * Read-only total: tanpa migrasi, tanpa snapshot kolom baru, tanpa
 * menahan dokumen. Hasil hanya peringatan untuk ditampilkan pemanggil.
 * Dokumen tanpa kendaraan → null (tidak ada konfigurasi untuk dinilai;
 * jangan tebak kendaraan dari pelanggan).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildFitmentForDocument,
  configurationFromCustomerVehicle,
  type FitmentDocumentLineInput,
  type FitmentForDocumentResult,
  type FitmentRuleInput,
} from "@/lib/reports/fitment-for-document"

export type {
  FitmentDocumentLine,
  FitmentDocumentResult,
  FitmentForDocumentResult,
} from "@/lib/reports/fitment-for-document"
export {
  FITMENT_FOR_DOCUMENT_NOTICE,
  buildFitmentForDocument,
  configurationFromCustomerVehicle,
} from "@/lib/reports/fitment-for-document"

async function loadConfiguration(customerVehicleId: number) {
  const cv = await prisma.customerVehicle.findFirst({
    where: { id: customerVehicleId, deletedAt: null },
    select: {
      id: true,
      vehicle: {
        select: {
          year: true,
          variant: {
            select: {
              id: true,
              drivetrain: true,
              transmission: true,
              model: { select: { id: true, vehicleBrandId: true } },
            },
          },
        },
      },
    },
  })
  if (!cv) return null
  return configurationFromCustomerVehicle({
    customerVehicleId: cv.id,
    vehicleYear: cv.vehicle.year,
    variantId: cv.vehicle.variant.id,
    variantDrivetrain: cv.vehicle.variant.drivetrain,
    variantTransmission: cv.vehicle.variant.transmission,
    modelId: cv.vehicle.variant.model.id,
    brandId: cv.vehicle.variant.model.vehicleBrandId,
  })
}

async function loadActiveRules(itemIds: number[]): Promise<FitmentRuleInput[]> {
  if (itemIds.length === 0) return []
  const rules = await prisma.vehicleFitmentRule.findMany({
    where: { itemId: { in: itemIds }, isActive: true },
    orderBy: { id: "asc" },
    select: {
      id: true,
      itemId: true,
      bomRevisionId: true,
      vehicleBrandId: true,
      vehicleModelId: true,
      vehicleVariantId: true,
      yearFrom: true,
      yearTo: true,
      drivetrain: true,
      transmission: true,
      result: true,
      source: true,
      notes: true,
    },
  })
  return rules
}

/** Flag jasa per item — QuotationItem/WorkOrderItem tanpa relasi `item`. */
async function loadServiceItemIds(itemIds: number[]): Promise<Set<number>> {
  if (itemIds.length === 0) return new Set()
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds }, isService: true },
    select: { id: true },
  })
  return new Set(items.map((i) => i.id))
}

function withServiceFlags(
  lines: Omit<FitmentDocumentLineInput, "isService">[],
  serviceIds: ReadonlySet<number>,
): FitmentDocumentLineInput[] {
  return lines.map((line) => ({
    ...line,
    isService: line.itemId != null && serviceIds.has(line.itemId),
  }))
}

async function evaluateDocument(
  customerVehicleId: number | null,
  lines: FitmentDocumentLineInput[],
): Promise<FitmentForDocumentResult | null> {
  if (customerVehicleId == null) return null
  const configuration = await loadConfiguration(customerVehicleId)
  if (!configuration) return null
  const itemIds = [
    ...new Set(
      lines
        .filter((l) => !l.isService && l.itemId != null)
        .map((l) => l.itemId as number),
    ),
  ]
  const rules = await loadActiveRules(itemIds)
  return buildFitmentForDocument({ configuration, lines, rules })
}

/** Fitment baris Quotation untuk kendaraan tertautnya; null bila tanpa kendaraan. */
export async function getQuotationFitment(
  quotationId: number,
): Promise<FitmentForDocumentResult | null> {
  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, deletedAt: null },
    select: {
      customerVehicleId: true,
      sections: {
        select: {
          items: {
            select: { id: true, itemId: true, description: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  })
  if (!quotation) return null
  const rawLines = quotation.sections.flatMap((s) =>
    s.items.map((item) => ({
      lineId: item.id,
      itemId: item.itemId,
      description: item.description,
    })),
  )
  const serviceIds = await loadServiceItemIds(
    rawLines.map((l) => l.itemId).filter((id): id is number => id != null),
  )
  return evaluateDocument(
    quotation.customerVehicleId,
    withServiceFlags(rawLines, serviceIds),
  )
}

/** Fitment baris WorkOrder untuk kendaraan tertautnya; null bila tanpa kendaraan. */
export async function getWorkOrderFitment(
  workOrderId: number,
): Promise<FitmentForDocumentResult | null> {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId },
    select: {
      customerVehicleId: true,
      bomRevisionId: true,
      items: {
        select: { id: true, itemId: true, description: true },
        orderBy: { id: "asc" },
      },
    },
  })
  if (!workOrder) return null
  const rawLines = workOrder.items.map((item) => ({
    lineId: item.id,
    itemId: item.itemId as number | null,
    description: item.description,
    bomRevisionId: workOrder.bomRevisionId,
  }))
  const serviceIds = await loadServiceItemIds(
    rawLines.map((l) => l.itemId).filter((id): id is number => id != null),
  )
  return evaluateDocument(
    workOrder.customerVehicleId,
    withServiceFlags(rawLines, serviceIds),
  )
}
