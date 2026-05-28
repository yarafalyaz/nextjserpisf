"use server"

import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

function getWibNow(now = new Date()) {
  const wibOffset = 7 * 60 * 60 * 1000
  return new Date(now.getTime() + wibOffset)
}

function getWibTodayUtcDate(now = new Date()) {
  const wibNow = getWibNow(now)
  return new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()))
}

function getWibDayOfWeek(now = new Date()) {
  const wibOffset = 7 * 60 * 60 * 1000
  const wibNow = new Date(now.getTime() + wibOffset)
  return wibNow.getUTCDay()
}

function parseStartMinutes(startTime: string) {
  const [h, m] = startTime.split(":").map((v) => Number(v || 0))
  return h * 60 + m
}

function getWibMinutes(now = new Date()) {
  const wibOffset = 7 * 60 * 60 * 1000
  const wibNow = new Date(now.getTime() + wibOffset)
  return wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes()
}

async function resolveScheduleStartTime(employeeDepartmentId: number | null | undefined, dayOfWeek: number) {
  const schedules = await prisma.workSchedule.findMany({
    where: {
      isActive: true,
      dayOfWeek,
      OR: [{ departmentId: employeeDepartmentId ?? undefined }, { departmentId: null }],
    },
    orderBy: { departmentId: "desc" },
  })

  const picked =
    schedules.find((s) => s.departmentId === (employeeDepartmentId ?? null)) ??
    schedules.find((s) => s.departmentId === null)

  return picked?.startTime ?? "08:00"
}

/**
 * Self-service check in — karyawan absen masuk sendiri.
 * GPS coordinates dikirim dari browser (client-side geolocation).
 */
export async function selfCheckIn(latitude?: number, longitude?: number) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Silakan login terlebih dahulu")

  const userId = Number(session.user.id)

  const employee = await prisma.employee.findFirst({
    where: { userId },
    select: { id: true, name: true, departmentId: true },
  })
  if (!employee) throw new Error("Akun Anda tidak terhubung ke data karyawan")

  const now = new Date()
  const today = getWibTodayUtcDate(now)

  // Cek sudah check-in hari ini?
  const existing = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, date: today },
  })
  if (existing) throw new Error("Anda sudah check-in hari ini")

  // Guard: holiday
  const holiday = await prisma.holiday.findFirst({ where: { date: today } })
  const deptHoliday = await prisma.departmentHoliday.findFirst({
    where: { departmentId: employee.departmentId ?? undefined, date: today },
  })
  if (holiday || deptHoliday) {
    throw new Error("Hari ini adalah hari libur. Tidak dapat check-in.")
  }

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

  const dayOfWeek = getWibDayOfWeek(now)
  const scheduleStart = await resolveScheduleStartTime(employee.departmentId, dayOfWeek)
  const wibNow = getWibNow(now)
  const nowMinutes = wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes()
  const startMinutes = parseStartMinutes(scheduleStart)
  const isLate = nowMinutes > startMinutes
  const lateMinutes = isLate ? nowMinutes - startMinutes : 0

  const attendance = await prisma.attendance.create({
    data: {
      employeeId: employee.id,
      date: today,
      checkIn: now,
      status: isLate ? "late" : "present",
      lateMinutes,
      checkInLatitude: latitude ?? null,
      checkInLongitude: longitude ?? null,
    },
  })

  revalidatePath("/sdm/absensi")
  return { success: true, id: attendance.id, checkInTime: now.toISOString() }
}

/**
 * Self-service check out — karyawan absen pulang sendiri.
 */
export async function selfCheckOut(latitude?: number, longitude?: number) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Silakan login terlebih dahulu")

  const userId = Number(session.user.id)

  const employee = await prisma.employee.findFirst({
    where: { userId },
    select: { id: true, name: true, departmentId: true },
  })
  if (!employee) throw new Error("Akun Anda tidak terhubung ke data karyawan")

  const now = new Date()
  const today = getWibTodayUtcDate(now)

  const attendance = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, date: today, checkOut: null },
  })
  if (!attendance) throw new Error("Belum check-in atau sudah check-out hari ini")

  const dayOfWeek = getWibDayOfWeek(now)
  const schedule = await prisma.workSchedule.findFirst({
    where: {
      isActive: true,
      dayOfWeek,
      OR: [{ departmentId: employee.departmentId ?? undefined }, { departmentId: null }],
    },
    orderBy: { departmentId: "desc" },
  })
  const workEnd = schedule?.endTime ?? "17:00"
  const isHalfDay = getWibMinutes(now) < parseStartMinutes(workEnd)

  await prisma.attendance.update({
    where: { id: attendance.id },
    data: {
      checkOut: now,
      checkOutLatitude: latitude ?? null,
      checkOutLongitude: longitude ?? null,
      status: isHalfDay ? "half_day" : attendance.status,
    },
  })

  revalidatePath("/sdm/absensi")
  return { success: true, checkOutTime: now.toISOString() }
}

/**
 * Get today's attendance status for the current user.
 */
export async function getTodayAttendance() {
  const session = await auth()
  if (!session?.user?.id) return null

  const userId = Number(session.user.id)

  const employee = await prisma.employee.findFirst({
    where: { userId },
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
}

/**
 * Get company coordinates from settings to calculate distance.
 */
export async function getCompanyLocation() {
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
