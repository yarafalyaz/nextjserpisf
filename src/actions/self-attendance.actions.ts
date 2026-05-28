"use server"

import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

/**
 * Self-service check in — karyawan absen masuk sendiri.
 * GPS coordinates dikirim dari browser (client-side geolocation).
 */
export async function selfCheckIn(latitude?: number, longitude?: number) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Silakan login terlebih dahulu")

  const userId = Number(session.user.id)

  // Cari employee by userId
  const employee = await prisma.employee.findFirst({
    where: { userId },
    select: { id: true, name: true },
  })
  if (!employee) throw new Error("Akun Anda tidak terhubung ke data karyawan")

  // WIB timezone
  const now = new Date()
  const wibOffset = 7 * 60 * 60 * 1000
  const wibNow = new Date(now.getTime() + wibOffset)
  const today = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()))

  // Cek sudah check-in hari ini?
  const existing = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, date: today },
  })
  if (existing) throw new Error("Anda sudah check-in hari ini")

  const attendance = await prisma.attendance.create({
    data: {
      employeeId: employee.id,
      date: today,
      checkIn: now,
      status: "present",
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
    select: { id: true, name: true },
  })
  if (!employee) throw new Error("Akun Anda tidak terhubung ke data karyawan")

  const now = new Date()
  const wibOffset = 7 * 60 * 60 * 1000
  const wibNow = new Date(now.getTime() + wibOffset)
  const today = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()))

  const attendance = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, date: today, checkOut: null },
  })
  if (!attendance) throw new Error("Belum check-in atau sudah check-out hari ini")

  await prisma.attendance.update({
    where: { id: attendance.id },
    data: {
      checkOut: now,
      checkOutLatitude: latitude ?? null,
      checkOutLongitude: longitude ?? null,
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
  const wibOffset = 7 * 60 * 60 * 1000
  const wibNow = new Date(now.getTime() + wibOffset)
  const today = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()))

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
