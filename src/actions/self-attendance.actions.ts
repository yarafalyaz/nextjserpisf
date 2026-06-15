"use server"

import { requireAuth } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { getSystemSettings } from "@/lib/utils/settings"
import { parseFormData } from "@/lib/validations/parse-form"
import { selfAttendanceLocationSchema } from "@/lib/validations/self-attendance.schemas"
import {
  getWibNow,
  getWibTodayUtcDate,
  getWibDayOfWeek,
  parseStartMinutes,
  getWibMinutes,
  haversineKm,
} from "@/lib/utils/attendance-time"

/** Enforce company geofence server-side. Throws if too far. */
async function enforceGeofence(latitude?: number, longitude?: number) {
  const settings = await prisma.systemSetting.findFirst({
    select: { companyLatitude: true, companyLongitude: true, attendanceRadiusKm: true },
  })
  if (!settings?.companyLatitude || !settings?.companyLongitude || !settings?.attendanceRadiusKm) return

  // If geofence is enabled, GPS coordinates are MANDATORY.
  // Allowing null bypasses the radius check entirely (fraud vector).
  if (latitude == null || longitude == null) {
    throw new Error("Gagal mendapatkan lokasi GPS. Pastikan izin lokasi (GPS) diaktifkan untuk absen.")
  }

  const dist = haversineKm(latitude, longitude, Number(settings.companyLatitude), Number(settings.companyLongitude))
  const maxKm = Number(settings.attendanceRadiusKm)
  if (maxKm > 0 && dist > maxKm) {
    throw new Error(`Anda berada di luar radius absensi (${dist.toFixed(2)} km dari lokasi kantor, maks ${maxKm} km).`)
  }
}

async function resolveScheduleInfo(employeeId: number | null | undefined, employeeDepartmentId: number | null | undefined, dayOfWeek: number) {
  const schedules = await prisma.workSchedule.findMany({
    where: { isActive: true },
    include: { employees: { select: { id: true } }, departments: { select: { id: true } } },
  })
  const onDay = schedules.filter((s) =>
    s.workDays.split(",").map((d) => Number(d.trim())).includes(dayOfWeek)
  )
  const picked =
    onDay.find((s) => employeeId != null && s.employees.some((e) => e.id === employeeId)) ??
    onDay.find((s) => s.employees.length === 0 && employeeDepartmentId != null && s.departments.some((d) => d.id === employeeDepartmentId)) ??
    onDay.find((s) => s.employees.length === 0 && s.departments.length === 0)

  return { startTime: picked?.startTime ?? "08:00", tolerance: picked?.lateToleranceMinutes ?? 0 }
}

/**
 * Self-service check in — karyawan absen masuk sendiri.
 * GPS coordinates dikirim dari browser (client-side geolocation).
 */
export async function selfCheckIn(formData: FormData) {
  const parsed = parseFormData(selfAttendanceLocationSchema, formData)
  if (!parsed.success) throw new Error(parsed.error)
  const { latitude, longitude } = parsed.data
  const user = await requireAuth()

  const userId = Number(user.id)

  const employee = await prisma.employee.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true, name: true, departmentId: true },
  })
  if (!employee) throw new Error("Akun Anda tidak terhubung ke data karyawan")

  const now = new Date()
  const today = getWibTodayUtcDate(now)

  // Hari libur (Minggu / libur nasional / libur departemen) → kerja dicatat
  // sebagai lembur dan otomatis jadi pengajuan lembur saat check-out.
  const holiday = await prisma.holiday.findFirst({ where: { date: today } })
  // Only query department holiday if the employee actually belongs to a
  // department. Passing `undefined` to a Prisma `where` filter is silently
  // dropped, which would match ANY department's holiday and incorrectly flag
  // department-less employees as on a holiday.
  const deptHoliday =
    employee.departmentId != null
      ? await prisma.departmentHoliday.findFirst({
          where: { departmentId: employee.departmentId, date: today },
        })
      : null
  const isOvertimeDay = getWibDayOfWeek(now) === 0 || !!holiday || !!deptHoliday

  // Guard: approved leave
  const approvedLeave = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: "approved",
      startDate: { lte: today },
      endDate: { gte: today },
    },
  })
  if (approvedLeave) {
    throw new Error("Anda sedang dalam masa cuti. Tidak dapat check-in.")
  }

  // Server-side geofence: reject if GPS is outside configured radius.
  await enforceGeofence(latitude, longitude)

  const dayOfWeek = getWibDayOfWeek(now)
  const { startTime: scheduleStart, tolerance } = await resolveScheduleInfo(employee.id, employee.departmentId, dayOfWeek)
  const wibNow = getWibNow(now)
  const nowMinutes = wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes()
  const startMinutes = parseStartMinutes(scheduleStart)
  const deadlineMinutes = startMinutes + tolerance
  const isLate = !isOvertimeDay && nowMinutes > deadlineMinutes
  const lateMinutes = isLate ? nowMinutes - deadlineMinutes : 0

  // Use transaction to prevent race condition (double check-in)
  const attendance = await prisma.$transaction(async (tx) => {
    const duplicate = await tx.attendance.findFirst({
      where: { employeeId: employee.id, date: today },
    })
    if (duplicate) throw new Error("Anda sudah check-in hari ini")

    return tx.attendance.create({
      data: {
        employeeId: employee.id,
        date: today,
        checkIn: now,
        status: isOvertimeDay ? "overtime" : isLate ? "late" : "present",
        lateMinutes,
        checkInLatitude: latitude ?? null,
        checkInLongitude: longitude ?? null,
      },
    })
  })

  revalidatePath("/sdm/absensi")
  return { success: true, id: attendance.id, checkInTime: now.toISOString() }
}

/**
 * Self-service check out — karyawan absen pulang sendiri.
 */
export async function selfCheckOut(formData: FormData) {
  const parsed = parseFormData(selfAttendanceLocationSchema, formData)
  if (!parsed.success) throw new Error(parsed.error)
  const { latitude, longitude } = parsed.data
  const user = await requireAuth()

  const userId = Number(user.id)

  const employee = await prisma.employee.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true, name: true, departmentId: true },
  })
  if (!employee) throw new Error("Akun Anda tidak terhubung ke data karyawan")

  // Server-side geofence: reject if GPS is outside configured radius.
  await enforceGeofence(latitude, longitude)

  const now = new Date()

  // Find the most recent OPEN attendance (no check-out) for this employee,
  // regardless of date. This handles overnight shifts that cross midnight.
  const attendance = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, checkOut: null },
    orderBy: { date: "desc" },
  })
  if (!attendance) throw new Error("Belum check-in atau sudah check-out")

  const dayOfWeek = getWibDayOfWeek(now)
  const candidateSchedules = await prisma.workSchedule.findMany({
    where: { isActive: true },
    include: { employees: { select: { id: true } }, departments: { select: { id: true } } },
  })
  const onDay = candidateSchedules.filter((s) =>
    s.workDays.split(",").map((d) => Number(d.trim())).includes(dayOfWeek)
  )
  const schedule =
    onDay.find((s) => s.employees.some((e) => e.id === employee.id)) ??
    onDay.find((s) => s.employees.length === 0 && employee.departmentId != null && s.departments.some((d) => d.id === employee.departmentId)) ??
    onDay.find((s) => s.employees.length === 0 && s.departments.length === 0) ??
    null
  const workEnd = schedule?.endTime ?? "17:00"
  const isOvertimeDay = attendance.status === "overtime"
  const isHalfDay = !isOvertimeDay && getWibMinutes(now) < parseStartMinutes(workEnd)

  let overtimeMinutes: number | null = null
  let overtimeHours = 0
  if (isOvertimeDay && attendance.checkIn) {
    const grossMinutes = Math.max(0, Math.round((now.getTime() - attendance.checkIn.getTime()) / 60000))
    // Potong jam istirahat (ISOMA) yang beririsan dengan jam kerja.
    const settings = await getSystemSettings()
    const inMin = getWibMinutes(attendance.checkIn)
    const outMin = getWibMinutes(now)
    let overlap = 0
    if (settings.restBreakStart && settings.restBreakEnd) {
      const bs = parseStartMinutes(settings.restBreakStart)
      const be = parseStartMinutes(settings.restBreakEnd)
      if (be > bs && outMin > inMin) overlap = Math.max(0, Math.min(outMin, be) - Math.max(inMin, bs))
    }
    overtimeMinutes = Math.max(0, grossMinutes - overlap)
    overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100
  }

  // Atomically claim the check-out: only the request that flips checkOut from
  // null wins. This serializes concurrent double check-outs (double-tap/retry)
  // so the overtime request below is created at most once. Previously the
  // create + update ran without this guard, so two concurrent check-outs could
  // both create a pending overtimeRequest → double-counted overtime in payroll.
  const claim = await prisma.attendance.updateMany({
    where: { id: attendance.id, checkOut: null },
    data: {
      checkOut: now,
      checkOutLatitude: latitude ?? null,
      checkOutLongitude: longitude ?? null,
      overtimeMinutes: overtimeMinutes ?? attendance.overtimeMinutes,
      status: isHalfDay ? "half_day" : attendance.status,
    },
  })
  if (claim.count === 0) {
    throw new Error("Sudah check-out")
  }

  // Only the winner of the claim reaches here → overtime created exactly once.
  if (isOvertimeDay && overtimeHours > 0) {
    await prisma.overtimeRequest.create({
      data: {
        employeeId: employee.id,
        date: attendance.date,
        hours: overtimeHours,
        totalHours: overtimeHours,
        reason: "Otomatis dari absensi hari libur",
        status: "pending",
      },
    })
  }

  revalidatePath("/sdm/absensi")
  return { success: true, checkOutTime: now.toISOString() }
}

/**
 * Get today's attendance status for the current user.
 */
export async function getTodayAttendance() {
  try {
  const user = await requireAuth()
  const userId = Number(user.id)

  const employee = await prisma.employee.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!employee) return null

  const now = new Date()
  const today = getWibTodayUtcDate(now)

  const attendance = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, date: today },
    select: {
      id: true,
      checkIn: true,
      checkOut: true,
      status: true,
      checkInLatitude: true,
      checkInLongitude: true,
      checkOutLatitude: true,
      checkOutLongitude: true,
    },
  })

  return attendance
    ? {
        id: attendance.id,
        checkIn: attendance.checkIn?.toISOString() ?? null,
        checkOut: attendance.checkOut?.toISOString() ?? null,
        status: attendance.status,
        checkInLatitude: attendance.checkInLatitude ? Number(attendance.checkInLatitude) : null,
        checkInLongitude: attendance.checkInLongitude ? Number(attendance.checkInLongitude) : null,
        checkOutLatitude: attendance.checkOutLatitude ? Number(attendance.checkOutLatitude) : null,
        checkOutLongitude: attendance.checkOutLongitude ? Number(attendance.checkOutLongitude) : null,
      }
    : null
  } catch {
    return null
  }
}

/**
 * Get company coordinates from settings to calculate distance.
 */
export async function getCompanyLocation() {
  await requireAuth()

  const settings = await prisma.systemSetting.findFirst({
    select: {
      companyLatitude: true,
      companyLongitude: true,
      attendanceRadiusKm: true,
    }
  })
  if (!settings) return null
  return {
    latitude: settings.companyLatitude ? Number(settings.companyLatitude) : null,
    longitude: settings.companyLongitude ? Number(settings.companyLongitude) : null,
    radius: settings.attendanceRadiusKm ? Number(settings.attendanceRadiusKm) : 1,
  }
}
