import { NextResponse } from "next/server"
import { isValidCronRequest } from "@/lib/security/cron"
import { apiError } from "@/lib/api-response"
import { syncNationalHolidays } from "@/lib/services/holiday-sync.service"

/**
 * Cron: Sinkronkan hari libur nasional tahun berjalan + tahun depan.
 * Schedule: tahunan, mis. 15 Desember 00:30 (30 0 15 12 *), atau
 * kapan pun — sinkronisasi idempoten dan tidak menimpa koreksi HR.
 *
 * Tanggal Hijriah/Nyepi hasil generator bersifat estimasi kalender;
 * begitu SKB 3 Menteri terbit, HR mengoreksi tanggalnya di Kalender
 * Kerja dan sinkronisasi berikutnya tidak akan mengembalikannya.
 */
export async function GET(request: Request) {
  try {
    if (!isValidCronRequest(request)) {
      return apiError("UNAUTHORIZED", "Tidak terotorisasi")
    }

    const url = new URL(request.url)
    const yearParam = url.searchParams.get("year")
    const currentYear = new Date().getFullYear()
    const years = yearParam
      ? [Number(yearParam)]
      : [currentYear, currentYear + 1]
    if (years.some((y) => !Number.isInteger(y) || y < 2000 || y > 2100)) {
      return apiError("BAD_REQUEST", "Parameter year tidak valid")
    }

    const report = await syncNationalHolidays(years)
    return NextResponse.json({ success: true, data: report })
  } catch (error) {
    console.error("[cron/sync-holidays]", error)
    return apiError("INTERNAL_ERROR", "Gagal menyinkronkan hari libur")
  }
}
