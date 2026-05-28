import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { calculateLatePenalty } from "@/lib/services/late-penalty.service"

/**
 * GET /api/payroll/late-penalty?karyawanId=X&tanggalMulai=YYYY-MM-DD&tanggalSelesai=YYYY-MM-DD
 * Returns late penalty calculation preview for payroll form.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Tidak terotorisasi" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const employeeId = Number(searchParams.get("karyawanId"))
  const startDateStr = searchParams.get("tanggalMulai")
  const endDateStr = searchParams.get("tanggalSelesai")

  if (!employeeId || !startDateStr || !endDateStr) {
    return NextResponse.json(
      { error: "employeeId, startDate, and endDate are required" },
      { status: 400 }
    )
  }

  const startDate = new Date(startDateStr)
  const endDate = new Date(endDateStr)

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
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
}
