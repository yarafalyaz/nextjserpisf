/**
 * Data laporan pekerjaan pesanan (bahan & biaya, penyelesaian, rincian jurnal) —
 * satu sumber untuk halaman dan PDF, sehingga angka di layar dan di PDF tidak
 * mungkin berbeda.
 *
 * Catatan penting soal penjumlahan biaya: **jurnal tidak menempel ke pekerjaan**.
 * Bahan masuk lewat `MaterialIssue.workOrderId`, biaya produksi lewat
 * `ProductionCost.workOrderId` (atau lewat perintah produksinya bila dikaitkan ke
 * order saja), dan penyelesaian lewat `ProductionOrder.workOrderId`. Karena itu
 * ketiga jalur itu dijumlahkan di sini, bukan diasumsikan seragam.
 */

import { prisma } from "@/lib/db/prisma"
import { safeAdd, safeMultiply } from "@/lib/utils/math"
import {
  buildJobOrderCost,
  type JobOrderCostResult,
} from "@/lib/reports/job-order-cost"
import {
  buildJobOrderCompletion,
  type JobOrderCompletionResult,
} from "@/lib/reports/job-order-completion"
import {
  buildJobOrderJournal,
  JOB_JOURNAL_REFERENCE_TYPES,
  jobJournalBaseReference,
  type JobOrderJournalResult,
} from "@/lib/reports/job-order-journal"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export interface JobOrderCostReport {
  cost: JobOrderCostResult
  periodLabel: string
  periodCaption: string
}

/**
 * Bahan & biaya per pekerjaan pada satu periode.
 *
 * Bahan diambil hanya dari pengeluaran bahan berstatus `completed` — pengeluaran
 * draft belum menggerakkan persediaan, jadi nilainya belum nyata (sama seperti
 * aturan pada laporan Laba Rugi per Proyek).
 */
export async function loadJobOrderCost(period: {
  start: Date
  end: Date
}): Promise<JobOrderCostReport> {
  const workOrders = await prisma.workOrder.findMany({
    where: { date: { gte: period.start, lte: period.end } },
    select: {
      id: true,
      documentNo: true,
      date: true,
      status: true,
      customer: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  })

  const empty = (): JobOrderCostReport => ({
    cost: buildJobOrderCost({ jobs: [], start: period.start, end: period.end }),
    ...rangePeriodLabels(period),
  })
  if (workOrders.length === 0) return empty()

  const workOrderIds = workOrders.map((workOrder) => workOrder.id)

  const [issues, costs, productionOrders] = await Promise.all([
    prisma.materialIssue.findMany({
      where: { workOrderId: { in: workOrderIds }, status: "completed" },
      select: { workOrderId: true, items: { select: { qty: true, cost: true } } },
    }),
    prisma.productionCost.findMany({
      // Biaya bisa dikaitkan langsung ke pekerjaan, atau ke perintah produksi
      // yang dikaitkan ke pekerjaan — keduanya harus ikut terhitung.
      where: {
        OR: [
          { workOrderId: { in: workOrderIds } },
          { productionOrder: { workOrderId: { in: workOrderIds } } },
        ],
      },
      select: {
        workOrderId: true,
        amount: true,
        productionOrder: { select: { workOrderId: true } },
      },
    }),
    prisma.productionOrder.findMany({
      where: { workOrderId: { in: workOrderIds } },
      select: { workOrderId: true, completedQty: true },
    }),
  ])

  const materialByWorkOrder = new Map<number, number>()
  for (const issue of issues) {
    if (issue.workOrderId === null) continue
    // ponytail: akumulasi sen-aman di loader; builder hanya meng-round total per WO masuk.
    const value = issue.items.reduce(
      (sum, item) => safeAdd(sum, safeMultiply(Number(item.qty), Number(item.cost), 2), 2),
      0,
    )
    materialByWorkOrder.set(
      issue.workOrderId,
      safeAdd(materialByWorkOrder.get(issue.workOrderId) ?? 0, value, 2),
    )
  }

  const costByWorkOrder = new Map<number, number>()
  for (const cost of costs) {
    const workOrderId = cost.workOrderId ?? cost.productionOrder?.workOrderId ?? null
    if (workOrderId === null) continue
    costByWorkOrder.set(
      workOrderId,
      safeAdd(costByWorkOrder.get(workOrderId) ?? 0, Number(cost.amount), 2),
    )
  }

  const completedByWorkOrder = new Map<number, number>()
  for (const order of productionOrders) {
    if (order.workOrderId === null) continue
    completedByWorkOrder.set(
      order.workOrderId,
      (completedByWorkOrder.get(order.workOrderId) ?? 0) + Number(order.completedQty),
    )
  }

  return {
    cost: buildJobOrderCost({
      jobs: workOrders.map((workOrder) => ({
        id: workOrder.id,
        documentNo: workOrder.documentNo,
        date: workOrder.date,
        customerName: workOrder.customer?.name ?? null,
        status: workOrder.status,
        materialCost: materialByWorkOrder.get(workOrder.id) ?? 0,
        productionCost: costByWorkOrder.get(workOrder.id) ?? 0,
        completedQty: completedByWorkOrder.get(workOrder.id) ?? 0,
      })),
      start: period.start,
      end: period.end,
    }),
    ...rangePeriodLabels(period),
  }
}

export interface JobOrderCompletionReport {
  completion: JobOrderCompletionResult
  periodLabel: string
  periodCaption: string
}

/** Barang jadi yang diselesaikan pada satu periode, beserta biaya satuannya. */
export async function loadJobOrderCompletion(period: {
  start: Date
  end: Date
}): Promise<JobOrderCompletionReport> {
  const rows = await prisma.productionGenealogy.findMany({
    where: { completedAt: { gte: period.start, lte: period.end } },
    select: {
      documentNo: true,
      completedAt: true,
      outputItemId: true,
      outputQty: true,
      unitCost: true,
      totalCost: true,
      productionOrder: {
        select: { documentNo: true, workOrder: { select: { documentNo: true } } },
      },
    },
    orderBy: { completedAt: "asc" },
  })

  // `ProductionGenealogy.outputItemId` tidak punya relasi ke `Item`, jadi nama
  // barangnya diambil sekali untuk semua baris. `Item` memakai `sku`, bukan
  // `code` — memakai `code` membuat query ini gagal begitu ada data.
  const itemIds = [...new Set(rows.map((row) => row.outputItemId))]
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, sku: true, name: true },
      })
    : []
  const itemById = new Map(items.map((item) => [item.id, item]))

  return {
    completion: buildJobOrderCompletion({
      completions: rows.map((row) => {
        const item = itemById.get(row.outputItemId)
        return {
          documentNo: row.documentNo,
          date: row.completedAt,
          jobLabel:
            row.productionOrder.workOrder?.documentNo ?? row.productionOrder.documentNo,
          itemCode: item?.sku ?? "",
          itemName: item?.name ?? `Barang #${row.outputItemId}`,
          qty: Number(row.outputQty),
          unitCost: Number(row.unitCost),
          totalCost: Number(row.totalCost),
        }
      }),
      start: period.start,
      end: period.end,
    }),
    ...rangePeriodLabels(period),
  }
}

export interface JobOrderJournalReport {
  journal: JobOrderJournalResult
  periodLabel: string
  periodCaption: string
}

/**
 * Rincian jurnal pekerjaan pesanan, dengan nomor pekerjaan dilacak dari dokumen
 * pemicu jurnalnya.
 *
 * `ProductionOrderMaterialIssue` dan `ProductionOrderCostVariance` sengaja
 * dibiarkan berlabel "Tanpa pekerjaan": referenceId keduanya bukan id perintah
 * produksi (satu menunjuk pergerakan stok, satu menunjuk baris selisih), jadi
 * memaksakan label akan menebak. Jurnalnya tetap ditampilkan karena jurnal adalah
 * bukti, bukan ringkasan.
 */
export async function loadJobOrderJournal(period: {
  start: Date
  end: Date
}): Promise<JobOrderJournalReport> {
  // Tetap POSTED-saja (TASK-022): terfilter referenceType produksi; jurnal
  // lawan reversal ber-referenceType "Journal" tersaring keluar, jadi
  // memasukkan REVERSED akan menghitung asli tanpa lawannya.
  // Neto nol hanya untuk pasangan reversal satu tingkat.
  const journals = await prisma.journal.findMany({
    where: {
      deletedAt: null,
      status: "POSTED",
      transactionDate: { gte: period.start, lte: period.end },
      // Jurnal penyelesaian/varians per-rilis parsial memakai suffix
      // `_<stockMoveId>`; tangkap keduanya lewat awalan jenis dasarnya.
      OR: [
        { referenceType: { in: [...JOB_JOURNAL_REFERENCE_TYPES] } },
        { referenceType: { startsWith: "ProductionOrder_" } },
        { referenceType: { startsWith: "ProductionOrderCostVariance_" } },
      ],
    },
    select: {
      id: true,
      journalNumber: true,
      transactionDate: true,
      referenceType: true,
      referenceId: true,
      description: true,
      entries: {
        select: { debit: true, credit: true, account: { select: { code: true, name: true } } },
      },
    },
    orderBy: { transactionDate: "asc" },
  })

  const idsOf = (referenceType: string) =>
    journals
      .filter(
        (journal) =>
          jobJournalBaseReference(journal.referenceType ?? "") === referenceType &&
          journal.referenceId !== null,
      )
      .map((journal) => journal.referenceId as number)

  const orderIds = [...new Set(idsOf("ProductionOrder"))]
  const issueIds = [...new Set(idsOf("MaterialIssue"))]
  const costIds = [...new Set(idsOf("ProductionCost"))]

  // `in: []` sudah mengembalikan nol baris, jadi tidak perlu percabangan kosong.
  // Ketiganya ditulis terpisah (bukan Promise.all): inferensi tipe tuple Prisma
  // di sini jatuh ke `never`, dan tiga query berurutan biayanya tidak berarti.
  const orders = await prisma.productionOrder.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, documentNo: true, workOrder: { select: { documentNo: true } } },
  })

  // `MaterialIssue` tidak punya relasi `workOrder`/`project` di skema (hanya
  // kolom id-nya), jadi label pekerjaan/proyeknya diambil lewat lookup.
  const issues = await prisma.materialIssue.findMany({
    where: { id: { in: issueIds } },
    select: { id: true, documentNo: true, projectId: true, workOrderId: true },
  })

  const issueProjectIds = [
    ...new Set(issues.map((issue) => issue.projectId).filter((id): id is number => id !== null)),
  ]
  const issueWorkOrderIds = [
    ...new Set(issues.map((issue) => issue.workOrderId).filter((id): id is number => id !== null)),
  ]
  const [projects, issueWorkOrders] = await Promise.all([
    issueProjectIds.length
      ? prisma.project.findMany({
          where: { id: { in: issueProjectIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: number; name: string }[]),
    issueWorkOrderIds.length
      ? prisma.workOrder.findMany({
          where: { id: { in: issueWorkOrderIds } },
          select: { id: true, documentNo: true },
        })
      : Promise.resolve([] as { id: number; documentNo: string }[]),
  ])
  const projectName = new Map(projects.map((project) => [project.id, project.name]))
  const issueWorkOrderLabel = new Map(
    issueWorkOrders.map((workOrder) => [workOrder.id, workOrder.documentNo]),
  )

  const costs = await prisma.productionCost.findMany({
    where: { id: { in: costIds } },
    select: {
      id: true,
      workOrder: { select: { documentNo: true } },
      productionOrder: {
        select: { documentNo: true, workOrder: { select: { documentNo: true } } },
      },
    },
  })

  const orderLabel = new Map(
    orders.map((order) => [order.id, order.workOrder?.documentNo ?? order.documentNo]),
  )
  const issueLabel = new Map(
    issues.map((issue) => [
      issue.id,
      (issue.workOrderId !== null ? issueWorkOrderLabel.get(issue.workOrderId) : null) ??
        (issue.projectId !== null ? (projectName.get(issue.projectId) ?? null) : null),
    ]),
  )
  const costLabel = new Map(
    costs.map((cost) => [
      cost.id,
      cost.workOrder?.documentNo ??
        cost.productionOrder?.workOrder?.documentNo ??
        cost.productionOrder?.documentNo ??
        null,
    ]),
  )

  return {
    journal: buildJobOrderJournal({
      journals: journals.map((journal) => {
        const referenceId = journal.referenceId
        const jobLabel =
          jobJournalBaseReference(journal.referenceType ?? "") === "ProductionOrder"
            ? (referenceId !== null ? (orderLabel.get(referenceId) ?? null) : null)
            : journal.referenceType === "MaterialIssue"
              ? (referenceId !== null ? (issueLabel.get(referenceId) ?? null) : null)
              : journal.referenceType === "ProductionCost"
                ? (referenceId !== null ? (costLabel.get(referenceId) ?? null) : null)
                : null

        return {
          id: journal.id,
          journalNumber: journal.journalNumber,
          date: journal.transactionDate,
          referenceType: journal.referenceType ?? "",
          jobLabel,
          description: journal.description,
          lines: journal.entries.map((entry) => ({
            accountCode: entry.account.code,
            accountName: entry.account.name,
            debit: Number(entry.debit),
            credit: Number(entry.credit),
          })),
        }
      }),
    }),
    ...rangePeriodLabels(period),
  }
}
