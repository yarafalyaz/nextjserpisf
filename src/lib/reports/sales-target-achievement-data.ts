/**
 * Loader read-only target vs pencapaian penjualan (F-2026-10-22-088-S
 * tahap 1 + F-2026-10-24-131-V tahap 2 basis NETO). Query massal: target
 * aktif (deletedAt null) yang bersinggungan rentang laporan + faktur paid
 * dalam cakupan gabungan (periode target ∪ rentang laporan) + retur
 * completed tertaut faktur paid itu (satu query massal, beserta baris).
 *
 * BASIS BRUTO IDENTIK rekap komisi (BR-TGT-01): faktur memakai filter
 * yang sama persis dengan sales-commission-data.ts — status "paid",
 * deletedAt null, `date` dalam jendela, snapshot salesEmployeeId.
 * Rekap komisi TIDAK diubah tahap 2; kesamaan dibuktikan kunci
 * rekonsiliasi (buildSalesTargetPeriodReconciliation) bukan lagi
 * pencapaian == paidBase.
 *
 * Retur (Putusan 2/3 F-131-V): hanya status "completed", salesInvoiceId
 * tidak null, `date` retur dalam cakupan gabungan yang sama — retur
 * di-query berdasar tanggal retur (BUKAN disaring ke faktur paid dalam
 * cakupan), lalu faktur asal paid-nya dimuat walau tanggal faktur di
 * luar cakupan, supaya retur lintas-periode tetap mengurangi periode
 * tanggal retur (E131-2) dan periode asal tidak berubah. Nilai per retur =
 * Σ (returnDpp+returnVat) snapshot; legacy diturunkan builder.
 *
 * Lencana "Target diubah" (BR-TGT-09) diturunkan dari ActivityLog
 * sales_target_updated terakhir per target yang jatuh sesudah
 * periodStart target itu — laporan memakai nilai target terkini.
 * Read-only: tanpa migrasi/jurnal/mutasi (nol jurnal dari read-model).
 *
 * Izin (LOW-2 audit #583, pola collection-queue-data): kedua fungsi
 * loader memegang gerbangnya sendiri, fail-closed sebelum query:
 * - getSalesTargetAchievement: laporan baca = view_reports.
 *   Pemanggil lama getSalesTargetAchievementReport menegakkan izin
 *   yang sama lebih dulu di lapisan aksi; gerbang ganda berhenti di
 *   lapisan pemanggil, loader aman dipanggil langsung.
 * - listSalesTargets: daftar kelola = approve_sales_invoices,
 *   ditegakkan juga sebelum query. Satu-satunya pemanggil saat ini
 *   (page laporan, PR #604) sudah menyeleksi canManage dan hanya
 *   memanggil saat true — jadi tanpa izin tidak pernah terpicu di
 *   jalur lama; gerbang ini menutup pemanggil masa depan yang lupa
 *   menyeleksi.
 */

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import {
  buildSalesTargetAchievement,
  buildSalesTargetPeriodReconciliation,
  type SalesTargetAchievement,
  type SalesTargetPeriodReconciliation,
  type SalesTargetPaidInvoiceInput,
} from "@/lib/reports/sales-target-achievement"
import { buildSalesCommissionRecap } from "@/lib/reports/sales-commission"
import { getSystemSettings } from "@/lib/utils/settings"
import { safeAdd } from "@/lib/utils/math"

export async function getSalesTargetAchievement(range: {
  start: Date
  end: Date
}): Promise<SalesTargetAchievement> {
  await requirePermission("view_reports")
  const targets = await prisma.salesTarget.findMany({
    where: {
      deletedAt: null,
      periodStart: { lte: range.end },
      periodEnd: { gte: range.start },
    },
    select: {
      id: true,
      salesEmployeeId: true,
      periodStart: true,
      periodEnd: true,
      targetAmount: true,
      notes: true,
      salesEmployee: { select: { name: true } },
    },
    orderBy: [{ periodStart: "asc" }, { id: "asc" }],
  })

  // Cakupan faktur: gabungan periode target + rentang laporan supaya
  // pencapaian periode target utuh DAN ember rentang sama-sama terisi.
  let coverageStart = range.start
  let coverageEnd = range.end
  for (const t of targets) {
    if (t.periodStart.getTime() < coverageStart.getTime()) coverageStart = t.periodStart
    if (t.periodEnd.getTime() > coverageEnd.getTime()) coverageEnd = t.periodEnd
  }
  // periodEnd disimpan tengah malam UTC: jendela faktur menutup akhir
  // hari itu (inklusif), pola loader komisi endDate.setHours(23:59:59).
  const invoiceEnd = new Date(coverageEnd.getTime() + 24 * 3_600_000 - 1)

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      deletedAt: null,
      status: "paid",
      date: { gte: coverageStart, lte: invoiceEnd },
    },
    select: {
      id: true,
      salesEmployeeId: true,
      date: true,
      grandTotal: true,
      subtotal: true,
      discount: true,
      taxAmount: true,
      salesEmployee: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })

  // Retur pengurang (F-131-V Putusan 2/3, HIGH-1 t_4079da4f): query
  // berdasar TANGGAL RETUR dalam cakupan gabungan — tanpa gerbang
  // faktur paid dalam cakupan, supaya retur atas faktur paid periode
  // sebelumnya tetap masuk. Faktur asal paid di luar cakupan dimuat
  // sesudahnya (pola sourceInvoices rekonsiliasi di bawah); retur yang
  // faktur asalnya tidak paid/terhapus dibuang builder (tak ada di map).
  const returns = await prisma.salesReturn.findMany({
    where: {
      status: "completed",
      salesInvoiceId: { not: null },
      date: { gte: coverageStart, lte: invoiceEnd },
    },
    select: {
      id: true,
      date: true,
      salesInvoiceId: true,
      items: {
        select: { qty: true, price: true, returnDpp: true, returnVat: true },
      },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })
  const coverageInvoiceIds = new Set(invoices.map((i) => i.id))
  const sourceInvoiceIds = [
    ...new Set(
      returns
        .map((r) => r.salesInvoiceId)
        .filter((id): id is number => id !== null && !coverageInvoiceIds.has(id)),
    ),
  ]
  const sourceInvoices =
    sourceInvoiceIds.length > 0
      ? await prisma.salesInvoice.findMany({
          where: { id: { in: sourceInvoiceIds }, deletedAt: null, status: "paid" },
          select: {
            id: true,
            salesEmployeeId: true,
            date: true,
            grandTotal: true,
            subtotal: true,
            discount: true,
            taxAmount: true,
            salesEmployee: { select: { name: true } },
          },
        })
      : []
  // Faktur asal lintas-periode hanya bahan atribusi/plafon/tarif legacy
  // builder; tanggalnya di luar periode dinilai sehingga tidak terhitung
  // sebagai bruto periode mana pun (builder menyaring per tanggal).
  const allInvoices = [...invoices, ...sourceInvoices]

  // BR-TGT-09: perubahan terakhir per target. Query massal tunggal.
  const targetIds = targets.map((t) => t.id)
  const updatedBy: Record<number, Date> = {}
  if (targetIds.length > 0) {
    const logs = await prisma.activityLog.findMany({
      where: {
        modelType: "SalesTarget",
        action: "sales_target_updated",
        modelId: { in: targetIds },
      },
      select: { modelId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })
    for (const log of logs) {
      if (log.modelId !== null && updatedBy[log.modelId] === undefined) {
        updatedBy[log.modelId] = log.createdAt
      }
    }
  }

  return buildSalesTargetAchievement({
    range,
    targets: targets.map((t) => {
      const lastUpdated: Date | undefined = updatedBy[t.id]
      return {
        id: t.id,
        salesEmployeeId: t.salesEmployeeId,
        salesEmployeeName: t.salesEmployee.name,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
        targetAmount: Number(t.targetAmount),
        notes: t.notes,
        modifiedAfterPeriodStartAt:
          lastUpdated !== undefined && lastUpdated.getTime() >= t.periodStart.getTime()
            ? lastUpdated
            : null,
      }
    }),
    invoices: allInvoices.map((inv) => ({
      id: inv.id,
      salesEmployeeId: inv.salesEmployeeId,
      salesEmployeeName: inv.salesEmployee?.name ?? null,
      date: inv.date,
      grandTotal: Number(inv.grandTotal),
      subtotal: Number(inv.subtotal),
      discount: Number(inv.discount),
      taxAmount: Number(inv.taxAmount),
    })),
    returns: returns.map((ret) => ({
      id: ret.id,
      date: ret.date,
      // Query menjamin tidak null (salesInvoiceId: { not: null }).
      salesInvoiceId: ret.salesInvoiceId as number,
      lines: ret.items.map((line) => ({
        qty: Number(line.qty),
        price: Number(line.price),
        returnDpp: line.returnDpp === null ? null : Number(line.returnDpp),
        returnVat: line.returnVat === null ? null : Number(line.returnVat),
      })),
    })),
  })
}

/**
 * Rekonsiliasi tiga arah satu periode (F-131-V Putusan 5) untuk periode
 * yang sama persis dengan `range` (rentang laporan = periode dinilai).
 * (i) gross target vs paidBase komisi dari builder komisi sendiri;
 * (ii) pengurang vs query sumber independen (query terpisah, bukan hasil
 * builder target); (iii) kaki debit akun Retur Penjualan jurnal retur
 * POSTED pada tanggal retur dalam periode — akun belum dipetakan →
 * null (tak terukur), bukan 0. Read-only, nol jurnal.
 */
export async function getSalesTargetPeriodReconciliation(range: {
  start: Date
  end: Date
}): Promise<SalesTargetPeriodReconciliation> {
  await requirePermission("view_reports")
  const achievement = await getSalesTargetAchievement(range)
  const periodEnd = new Date(range.end.getTime() + 24 * 3_600_000 - 1)

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      deletedAt: null,
      status: "paid",
      date: { gte: range.start, lte: periodEnd },
    },
    select: {
      id: true,
      salesEmployeeId: true,
      date: true,
      grandTotal: true,
      subtotal: true,
      discount: true,
      taxAmount: true,
      salesEmployee: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })
  const invoiceInputs: SalesTargetPaidInvoiceInput[] = invoices.map((inv) => ({
    id: inv.id,
    salesEmployeeId: inv.salesEmployeeId,
    salesEmployeeName: inv.salesEmployee?.name ?? null,
    date: inv.date,
    grandTotal: Number(inv.grandTotal),
    subtotal: Number(inv.subtotal),
    discount: Number(inv.discount),
    taxAmount: Number(inv.taxAmount),
  }))

  // (i) paidBase dari builder komisi sendiri atas faktur periode sama.
  const commission = buildSalesCommissionRecap(
    invoiceInputs.map((inv) => ({
      salesEmployeeId: inv.salesEmployeeId,
      salesEmployeeName: inv.salesEmployeeName,
      grandTotal: inv.grandTotal,
      commissionPercent: 0,
    })),
  )
  const commissionRows = [
    ...commission.rows.map((r) => ({ salesEmployeeId: r.salesEmployeeId as number | null, paidBase: r.paidBase })),
    { salesEmployeeId: null, paidBase: commission.unattributed.paidBase },
  ]

  // (ii) Query sumber independen: retur completed tertaut faktur paid
  // periode ini (faktur asal boleh dari periode lain — atribusi tetap
  // penjual snapshot faktur asal lewat builder).
  const paidIds = invoiceInputs.map((i) => i.id)
  // Faktur asal lintas-periode perlu tarif + grandTotal untuk legacy/clamp:
  // muat faktur asal retur periode ini yang tidak ada di daftar periode.
  const periodReturns = await prisma.salesReturn.findMany({
    where: {
      status: "completed",
      date: { gte: range.start, lte: periodEnd },
      salesInvoiceId: { not: null },
    },
    select: {
      id: true,
      date: true,
      salesInvoiceId: true,
      items: { select: { qty: true, price: true, returnDpp: true, returnVat: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })
  const sourceInvoiceIds = [
    ...new Set(
      periodReturns
        .map((r) => r.salesInvoiceId)
        .filter((id): id is number => id !== null && !paidIds.includes(id)),
    ),
  ]
  const sourceInvoices =
    sourceInvoiceIds.length > 0
      ? await prisma.salesInvoice.findMany({
          where: { id: { in: sourceInvoiceIds }, deletedAt: null, status: "paid" },
          select: {
            id: true,
            salesEmployeeId: true,
            date: true,
            grandTotal: true,
            subtotal: true,
            discount: true,
            taxAmount: true,
            salesEmployee: { select: { name: true } },
          },
        })
      : []
  const allInvoices: SalesTargetPaidInvoiceInput[] = [
    ...invoiceInputs,
    ...sourceInvoices.map((inv) => ({
      id: inv.id,
      salesEmployeeId: inv.salesEmployeeId,
      salesEmployeeName: inv.salesEmployee?.name ?? null,
      date: inv.date,
      grandTotal: Number(inv.grandTotal),
      subtotal: Number(inv.subtotal),
      discount: Number(inv.discount),
      taxAmount: Number(inv.taxAmount),
    })),
  ]
  const paidSourceIds = new Set(allInvoices.map((i) => i.id))
  const independentReturns = periodReturns
    .filter((r) => r.salesInvoiceId !== null && paidSourceIds.has(r.salesInvoiceId))
    .map((r) => ({
      salesInvoiceId: r.salesInvoiceId as number,
      salesEmployeeId: null,
      lines: r.items.map((line) => ({
        qty: Number(line.qty),
        price: Number(line.price),
        returnDpp: line.returnDpp === null ? null : Number(line.returnDpp),
        returnVat: line.returnVat === null ? null : Number(line.returnVat),
      })),
    }))

  // (iii) Kaki Retur Penjualan jurnal retur POSTED periode tanggal retur.
  // Tetap POSTED-saja (TASK-022): terfilter referenceType "SalesReturn";
  // jurnal lawan reversal ber-referenceType "Journal" tersaring keluar,
  // jadi memasukkan REVERSED akan menghitung asli tanpa lawannya.
  // Neto nol hanya untuk pasangan reversal satu tingkat.
  let settings: Awaited<ReturnType<typeof getSystemSettings>> | null = null
  try {
    settings = await getSystemSettings()
  } catch {
    settings = null
  }
  const salesReturnAccountId = settings?.salesReturnAccountId ?? null
  let postedJournalReturn: { debitAmount: number | null } | null = null
  if (salesReturnAccountId !== null) {
    const journals = await prisma.journal.findMany({
      where: {
        deletedAt: null,
        status: "POSTED",
        referenceType: "SalesReturn",
        transactionDate: { gte: range.start, lte: periodEnd },
      },
      select: {
        entries: {
          where: { accountId: salesReturnAccountId },
          select: { debit: true },
        },
      },
    })
    let debit = 0
    for (const j of journals) {
      for (const e of j.entries) debit = safeAdd(debit, Number(e.debit), 2)
    }
    postedJournalReturn = { debitAmount: debit }
  }

  return buildSalesTargetPeriodReconciliation({
    achievement,
    invoices: allInvoices,
    commissionRows,
    independentReturns,
    postedJournalReturn,
  })
}

/**
 * Daftar target aktif untuk form kelola.
 * Gerbang: approve_sales_invoices (LOW-2 audit #583) ditegakkan di
 * loader sebelum query.
 */
export async function listSalesTargets() {
  await requirePermission("approve_sales_invoices")
  return prisma.salesTarget.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      salesEmployeeId: true,
      periodStart: true,
      periodEnd: true,
      targetAmount: true,
      notes: true,
      updatedAt: true,
      salesEmployee: { select: { name: true, isActive: true } },
    },
    orderBy: [{ periodStart: "desc" }, { id: "desc" }],
  })
}
