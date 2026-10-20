/**
 * Read-model beban perintah kerja (F-2026-10-20-02, tahap backend aman).
 *
 * PUTUSAN manager: inti model WorkCenter/Operation/RoutingStep ditunda-teknis.
 * Yang dibangun hanya agregasi dari data existing — tanpa migrasi, tanpa
 * jurnal baru:
 *
 * - Beban dihitung per status WO AKTIF (himpunan `ACTIVE_WORK_ORDER_STATUSES`
 *   yang sama dengan papan antrian), bukan per ProjectStage: tahap proyek
 *   bukan tahap WO, dan WorkOrder tidak punya workCenterId/routing, jadi
 *   urutan operasi tidak dikarang.
 * - Jam dan nilai beban diambil dari snapshot baris `ProductionCost`
 *   (`hours`, `amount`) yang terhubung ke WO itu — TIDAK dihitung ulang dari
 *   tarif master (master tarif tidak ada) dan TIDAK dijurnal terpisah:
 *   ProductionCost sudah masuk HPP lewat `applyProductionCostDelta` +
 *   jurnal WIP `onProductionCostAbsorbed`, jurnal kedua = HPP ganda.
 * - Biaya yang hanya terhubung ke ProductionOrder (workOrderId kosong) tidak
 *   ditempelkan ke WO mana pun — atribusi tidak ditebak.
 *
 * Pure (tanpa Prisma/DOM); loader massalnya ada di `work-order-load-data.ts`.
 */

import { ACTIVE_WORK_ORDER_STATUSES } from "@/lib/reports/work-order-queue"

export interface WorkOrderLoadCostInput {
  workOrderId: number
  category: string
  /** Jam tercatat di baris biaya; null = baris tanpa jam (bukan 0 jam kerja). */
  hours: number | null
  /** Nominal snapshot baris biaya. */
  amount: number
}

export interface WorkOrderLoadOrderInput {
  id: number
  slug: string | null
  documentNo: string
  status: string
}

export interface WorkOrderLoadStatusGroup {
  status: string
  /** Jumlah WO aktif pada status ini. */
  workOrderCount: number
  /** Σ hours baris labor (jam kerja tercatat). */
  laborHours: number
  /** Σ hours baris machine (jam mesin tercatat). */
  machineHours: number
  /** Σ amount semua baris biaya pada WO status ini. */
  totalAmount: number
  byCategory: Record<string, { hours: number; amount: number }>
}

export interface WorkOrderLoadWorkOrder {
  id: number
  slug: string | null
  documentNo: string
  status: string
  laborHours: number
  machineHours: number
  totalAmount: number
  /** Jumlah baris biaya yang menempel ke WO ini. */
  costLineCount: number
}

export interface WorkOrderLoad {
  byStatus: WorkOrderLoadStatusGroup[]
  workOrders: WorkOrderLoadWorkOrder[]
  totalActive: number
  totalLaborHours: number
  totalMachineHours: number
  totalAmount: number
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

interface Accumulator {
  hours: number
  amount: number
  costLineCount: number
}

function emptyAccumulator(): Accumulator {
  return { hours: 0, amount: 0, costLineCount: 0 }
}

export function buildWorkOrderLoad(
  orders: readonly WorkOrderLoadOrderInput[],
  costs: readonly WorkOrderLoadCostInput[],
): WorkOrderLoad {
  const active = new Map<number, WorkOrderLoadOrderInput>()
  for (const order of orders) {
    if ((ACTIVE_WORK_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      active.set(order.id, order)
    }
  }

  const perWorkOrder = new Map<number, Map<string, Accumulator>>()
  for (const cost of costs) {
    if (!active.has(cost.workOrderId)) continue
    let categories = perWorkOrder.get(cost.workOrderId)
    if (!categories) {
      categories = new Map()
      perWorkOrder.set(cost.workOrderId, categories)
    }
    const acc = categories.get(cost.category) ?? emptyAccumulator()
    acc.hours += cost.hours ?? 0
    acc.amount += cost.amount
    acc.costLineCount += 1
    categories.set(cost.category, acc)
  }

  const groupMap = new Map<string, WorkOrderLoadStatusGroup & { seen: Set<number> }>()
  for (const status of ACTIVE_WORK_ORDER_STATUSES) {
    groupMap.set(status, {
      status,
      workOrderCount: 0,
      laborHours: 0,
      machineHours: 0,
      totalAmount: 0,
      byCategory: {},
      seen: new Set(),
    })
  }

  const workOrders: WorkOrderLoadWorkOrder[] = []
  let totalLaborHours = 0
  let totalMachineHours = 0
  let totalAmount = 0

  for (const order of active.values()) {
    const categories = perWorkOrder.get(order.id)
    let laborHours = 0
    let machineHours = 0
    let orderAmount = 0
    let costLineCount = 0
    const group = groupMap.get(order.status)
    if (categories) {
      for (const [category, acc] of categories) {
        if (category === "labor") laborHours = acc.hours
        if (category === "machine") machineHours = acc.hours
        orderAmount += acc.amount
        costLineCount += acc.costLineCount
        if (group) {
          const bucket = group.byCategory[category] ?? { hours: 0, amount: 0 }
          bucket.hours += acc.hours
          bucket.amount += acc.amount
          group.byCategory[category] = bucket
        }
      }
    }
    if (group && !group.seen.has(order.id)) {
      group.seen.add(order.id)
      group.workOrderCount += 1
      group.laborHours += laborHours
      group.machineHours += machineHours
      group.totalAmount += orderAmount
    }
    totalLaborHours += laborHours
    totalMachineHours += machineHours
    totalAmount += orderAmount
    workOrders.push({
      id: order.id,
      slug: order.slug,
      documentNo: order.documentNo,
      status: order.status,
      laborHours: round2(laborHours),
      machineHours: round2(machineHours),
      totalAmount: round2(orderAmount),
      costLineCount,
    })
  }

  workOrders.sort((a, b) =>
    a.documentNo !== b.documentNo ? (a.documentNo < b.documentNo ? -1 : 1) : a.id - b.id,
  )

  const byStatus = [...groupMap.values()].map((group) => {
    const byCategory: WorkOrderLoadStatusGroup["byCategory"] = {}
    for (const [category, bucket] of Object.entries(group.byCategory)) {
      byCategory[category] = { hours: round2(bucket.hours), amount: round2(bucket.amount) }
    }
    return {
      status: group.status,
      workOrderCount: group.workOrderCount,
      laborHours: round2(group.laborHours),
      machineHours: round2(group.machineHours),
      totalAmount: round2(group.totalAmount),
      byCategory,
    }
  })

  return {
    byStatus,
    workOrders,
    totalActive: active.size,
    totalLaborHours: round2(totalLaborHours),
    totalMachineHours: round2(totalMachineHours),
    totalAmount: round2(totalAmount),
  }
}
