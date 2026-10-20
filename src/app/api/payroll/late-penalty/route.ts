import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"
import { assertHrEmployeeAccess, getHrScope } from "@/lib/auth/hr-scope"
import { apiError } from "@/lib/api-response"
import { calculateLatePenalty } from "@/lib/services/late-penalty.service"

/**
 * GET /api/payroll/late-penalty?karyawanId=X&tanggalMulai=YYYY-MM-DD&tanggalSelesai=YYYY-MM-DD
 * Returns late penalty calculation preview for payroll form.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return apiError("UNAUTHORIZED", "Tidak terotorisasi")
    }
    // Payroll/salary-derived data — restrict to users who can view payroll.
    if (!(await hasPermission("view_payroll"))) {
      return apiError("FORBIDDEN", "Akses ditolak")
    }

    const { searchParams } = new URL(request.url)
    const employeeIdRaw = searchParams.get("karyawanId")
    // Number() menerima diam-diam "1e3"/"0x10"/"+5"/" 5" — ID karyawan bukan
    // desimal murni wajib 400, bukan dihitung untuk karyawan lain (pola
    // notifications/[id]/read).
    if (!employeeIdRaw || !/^\d+$/.test(employeeIdRaw)) {
      return apiError("BAD_REQUEST", "employeeId, startDate, dan endDate wajib diisi")
    }
    const employeeId = Number(employeeIdRaw)
    const startDateStr = searchParams.get("tanggalMulai")
    const endDateStr = searchParams.get("tanggalSelesai")

    if (!Number.isSafeInteger(employeeId) || employeeId <= 0 || !startDateStr || !endDateStr) {
      return apiError("BAD_REQUEST", "employeeId, startDate, dan endDate wajib diisi")
    }

    const scope = await getHrScope({
      id: String(session.user?.id ?? ""),
      roles: Array.isArray(session.user?.roles) ? session.user.roles : [],
    })
    try {
      await assertHrEmployeeAccess(scope, employeeId)
    } catch {
      return apiError("FORBIDDEN", "Akses ditolak")
    }

    const startDate = new Date(startDateStr)
    const endDate = new Date(endDateStr)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return apiError("BAD_REQUEST", "Format tanggal tidak valid")
    }

    // Cap date range to 90 days to prevent DoS (full-table attendance scan)
    const MAX_RANGE_DAYS = 90
    const rangeMs = endDate.getTime() - startDate.getTime()
    if (rangeMs < 0) {
      return apiError("BAD_REQUEST", "startDate harus sebelum endDate")
    }
    if (rangeMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      return apiError("BAD_REQUEST", `Rentang tanggal tidak boleh melebihi ${MAX_RANGE_DAYS} hari`)
    }

    const result = await calculateLatePenalty(employeeId, startDate, endDate)

    return NextResponse.json({
      totalLateMinutes: result.totalLateMinutes,
      totalPenalty: result.totalPenalty,
      lateDays: result.details.length,
      details: result.details.map((d) => ({
        date: d.date.toISOString().split("T")[0],
        scheduledStart: d.scheduledStart,
        actualCheckIn: d.actualCheckIn.toISOString(),
        lateMinutes: d.lateMinutes,
        penalty: d.penalty,
      })),
    })
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
