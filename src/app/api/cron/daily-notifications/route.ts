import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import { notificationService } from "@/lib/services/notification.service"
import { apiError } from "@/lib/api-response"
import { getDailyAttendanceMetrics } from "@/lib/services/daily-attendance.service"
import { loadWarehouseLowStock } from "@/lib/reports/min-stock-warehouse-alert"
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"

/**
 * Cron: Send daily notifications to admins.
 * Schedule: Daily at 07:00 (0 7 * * *)
 *
 * Mirrors Laravel: SendDailyNotifications command
 *
 * Checks:
 * - Low stock items (qty_on_hand <= min_stock)
 * - Overdue invoices (due_date < today, not fully paid)
 * - Pending POs older than 7 days
 * - Late attendance today
 * - Absent employees after 10:00
 */
export async function GET(request: Request) {
  try {
  if (!isValidCronRequest(request)) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  // Build today's [dayStart, dayEnd) window in LOCAL time. The previous
  // implementation did `toISOString().split("T")[0]` + `new Date('YYYY-MM-DDT...')`,
  // which silently dropped a day in any timezone east of UTC (e.g. Asia/Jakarta
  // = UTC+7): the ISO formatter returns the previous UTC date, and the
  // zero-padded string is then re-interpreted as local time. Notifications
  // about late/absent employees would be off by a full day.
  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(now)
  dayEnd.setHours(23, 59, 59, 999)

  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: { some: { name: { in: ["super_admin", "admin"] } } },
    },
    select: { id: true },
  })

  if (admins.length === 0) {
    return NextResponse.json({ message: "Tidak ada admin aktif." })
  }

  // Pre-resolve admin IDs once. notificationService.notifyAdmins internally
  // re-runs this same `prisma.user.findMany` on every call, so without this
  // a single cron pass issued up to 5 identical admin lookups (one per
  // notification category). Reusing the pre-fetched list via notifyUsers
  // drops 5 redundant round-trips to 0.
  const adminIds = admins.map((a) => a.id)

  const results: Record<string, number> = {}

  // 1. Low stock items
  const lowStockItems = await prisma.$queryRaw<Array<{ id: number; name: string; qty_on_hand: number; min_stock: number }>>`
    SELECT id, name, qty_on_hand, min_stock
    FROM items
    WHERE is_active = true
      AND min_stock > 0
      AND qty_on_hand <= min_stock
      AND deleted_at IS NULL
    LIMIT 20
  `

  if (lowStockItems.length > 0) {
    // Headline count must be the TRUE total, not the LIMIT-20 sample (else a
    // shop with 200 low items sees "20 Menipis"). Sample list stays capped.
    const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM items
      WHERE is_active = true
        AND min_stock > 0
        AND qty_on_hand <= min_stock
        AND deleted_at IS NULL
    `
    const total = Number(count)
    const itemList = lowStockItems
      .slice(0, 5)
      .map((i) => `• ${i.name} (Stok: ${i.qty_on_hand}, Min: ${i.min_stock})`)
      .join("\n")

    await notificationService.notifyUsersIfNew(
      adminIds,
      `${total} Barang Stok Menipis`,
      itemList + (total > 5 ? `\n...dan ${total - 5} lainnya` : ""),
      "warning",
      dayStart
    )
    results.lowStock = total
  }

  // 1b. F-2026-10-22-070-S (BR-MS-05): menipis per (barang, gudang) vs
  // minimum efektif. Dedupe per judul per hari via notifyUsersIfNew.
  // Kegagalan loader pasangan ini tidak menggagalkan notifikasi lain.
  let warehouseLow: Awaited<ReturnType<typeof loadWarehouseLowStock>> = []
  try {
    warehouseLow = await loadWarehouseLowStock()
  } catch (loadError) {
    console.error("[daily-notifications] gagal menilai stok per gudang", loadError)
    results.lowStockWarehouseError = 1
  }
  // PERF: batch (1 dedupe findMany + 1 createMany) menggantikan loop
  // notifyUsersIfNew serial ≤20×2 round-trip. Semantik sama: dedupe
  // per judul per hari, tiap judul independen. notifyUsers (line 85)
  // tidak dipakai — tanpa dedupe, re-run cron menggandakan notifikasi.
  await notificationService.notifyUsersIfNewBatch(
    adminIds,
    warehouseLow.slice(0, 20).map((line) => ({
      title: `Stok ${line.itemName} Menipis di ${line.warehouseName}`,
      body: `Stok di ${line.warehouseName}: ${line.qtyAtWarehouse} (Minimum: ${line.minStock}). Segera lakukan pembelian atau transfer antar gudang.`,
      type: "warning",
    })),
    dayStart
  )
  if (warehouseLow.length > 0) results.lowStockWarehouse = warehouseLow.length

  // 2. Overdue invoices
  // Q-SIQ-6: hanya piutang yang sudah diakui; draft/approved/sent belum
  // terbit tidak boleh terhitung/teragregat sebagai jatuh tempo.
  const overdueWhere = {
    dueDate: { lt: dayStart },
    paymentStatus: { not: "paid" as const },
    status: { in: [...RECOGNISED_AR_STATUSES] },
    deletedAt: null,
  }
  const [overdueCount, overdueAgg] = await Promise.all([
    prisma.salesInvoice.count({ where: overdueWhere }),
    prisma.salesInvoice.aggregate({
      where: overdueWhere,
      _sum: { grandTotal: true, paidAmount: true },
    }),
  ])

  if (overdueCount > 0) {
    const count = overdueCount
    // Total wajib dari aggregate seluruh where: findMany sampel (take:20)
    // membuat piutang tampil jauh lebih kecil dari sebenarnya.
    const totalOverdue = Number(overdueAgg._sum.grandTotal ?? 0) - Number(overdueAgg._sum.paidAmount ?? 0)

    await notificationService.notifyUsersIfNew(
      adminIds,
      `${count} Invoice Jatuh Tempo`,
      `Total piutang overdue: Rp ${totalOverdue.toLocaleString("id-ID")}`,
      "danger",
      dayStart
    )
    results.overdueInvoices = count
  }

  // 3. Pending POs older than 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // Judul wajib dari count penuh, bukan findMany take:20 (blok ini tak
  // menampilkan daftar, hanya jumlah — sampel murni plafon angka).
  const stalePOCount = await prisma.purchaseOrder.count({
    where: {
      status: "ordered",
      createdAt: { lt: sevenDaysAgo },
      deletedAt: null,
    },
  })

  if (stalePOCount > 0) {
    const count = stalePOCount
    await notificationService.notifyUsersIfNew(
      adminIds,
      `${count} PO Belum Diterima (>7 hari)`,
      `Ada ${count} pesanan pembelian yang sudah lebih dari 7 hari belum diterima barangnya.`,
      "warning",
      dayStart
    )
    results.stalePOs = count
  }

  // 4. Late attendance today
  // Daftar nama tetap sampel take:20, judul + sisa "lainnya" dari count penuh.
  const lateWhere = {
    date: { gte: dayStart, lt: dayEnd },
    OR: [{ status: "late" as const }, { lateMinutes: { gt: 0 } }],
  }
  const [lateCount, lateAttendances] = await Promise.all([
    prisma.attendance.count({ where: lateWhere }),
    prisma.attendance.findMany({
      where: lateWhere,
      // Hanya employee.name yang dirender di daftar telat di bawah; tanpa
      // select, baris absensi utuh + departemen utuh ikut termuat per baris.
      select: { employee: { select: { name: true } } },
      take: 20,
    }),
  ])

  if (lateCount > 0) {
    const count = lateCount
    const names = lateAttendances
      .slice(0, 5)
      .map((a) => `• ${a.employee?.name || "Unknown"}`)
      .join("\n")

    await notificationService.notifyUsersIfNew(
      adminIds,
      `${count} Karyawan Telat Hari Ini`,
      names + (count > 5 ? `\n...dan ${count - 5} lainnya` : ""),
      "warning",
      dayStart
    )
    results.lateAttendance = count
  }

  // 5. Absent employees after 10 AM, based on employee, department, or global schedules.
  if (now.getHours() >= 10) {
    const { absentEmployees } = await getDailyAttendanceMetrics(now)
    if (absentEmployees.length > 0) {
      const count = absentEmployees.length
      const names = absentEmployees
        .slice(0, 5)
        .map((e) => `• ${e.name}${e.department ? ` (${e.department.name})` : ""}`)
        .join("\n")
      await notificationService.notifyUsersIfNew(
        adminIds,
        `${count} Karyawan Belum Absen`,
        names + (count > 5 ? `\n...dan ${count - 5} lainnya` : ""),
        "danger",
        dayStart
      )
      results.absentEmployees = count
    }
  }

  return NextResponse.json({
    message: "Notifikasi harian terkirim.",
    adminsNotified: admins.length,
    results,
  })
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
