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
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const employeeId = Number(searchParams.get("karyawanId"))
    const startDateStr = searchParams.get("tanggalMulai")
    const endDateStr = searchParams.get("tanggalSelesai")

    if (!Number.isSafeInteger(employeeId) || employeeId <= 0 || !startDateStr || !endDateStr) {
      return NextResponse.json(
        { error: "employeeId, startDate, and endDate are required" },
        { status: 400 }
      )
    }

    const scope = await getHrScope({
      id: String(session.user?.id ?? ""),
      roles: Array.isArray(session.user?.roles) ? session.user.roles : [],
    })
    try {
      await assertHrEmployeeAccess(scope, employeeId)
    } catch {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 })
    }

    const startDate = new Date(startDateStr)
    const endDate = new Date(endDateStr)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
    }

    // Cap date range to 90 days to prevent DoS (full-table attendance scan)
    const MAX_RANGE_DAYS = 90
    const rangeMs = endDate.getTime() - startDate.getTime()
    if (rangeMs < 0) {
      return NextResponse.json({ error: "startDate must be before endDate" }, { status: 400 })
    }
    if (rangeMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` },
        { status: 400 }
      )
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
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 })
  }
}
