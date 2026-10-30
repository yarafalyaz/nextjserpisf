import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import {
  computeNationalHolidays,
  type ComputedHoliday,
} from "./holiday-calendar.service"

type Db = Pick<typeof prisma, "holiday">

/**
 * Db yang mampu transaksi serializable + kunci baris penanda. `prisma`
 * default (satu-satunya pemanggil produksi, route cron sync-holidays)
 * memenuhinya; stub test lama hanya menyediakan delegate `holiday` dan
 * jatuh ke jalur tanpa-tx lewat guard typeof di bawah.
 */
type TxDb = Db & {
  $transaction: (
    fn: (tx: Db & { $queryRaw: (...a: unknown[]) => Promise<unknown> }) => Promise<HolidaySyncReport>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) => Promise<HolidaySyncReport>
}

export interface HolidaySyncYearReport {
  year: number
  inserted: ComputedHoliday[]
  skippedExisting: number
}

export interface HolidaySyncReport {
  years: HolidaySyncYearReport[]
  totalInserted: number
  /** Tanggal estimasi kalender (Hijriah/Nyepi) yang baru terpasang. */
  estimatedInserted: ComputedHoliday[]
}

function wibDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

async function syncYears(years: number[], db: Db): Promise<HolidaySyncReport> {
  const report: HolidaySyncReport = { years: [], totalInserted: 0, estimatedInserted: [] }

  for (const year of years) {
    const computed = computeNationalHolidays(year)
    const existing = await db.holiday.findMany({
      where: {
        date: {
          gte: wibDateToUtcMidnight(`${year}-01-01`),
          lt: wibDateToUtcMidnight(`${year + 1}-01-01`),
        },
      },
      select: { date: true, name: true },
    })
    const existingDates = new Set(existing.map((h) => wibDateKey(h.date)))
    const existingNames = new Set(existing.map((h) => h.name.trim().toLowerCase()))

    const yearReport: HolidaySyncYearReport = { year, inserted: [], skippedExisting: 0 }
    for (const h of computed) {
      if (existingDates.has(h.date) || existingNames.has(h.name.trim().toLowerCase())) {
        yearReport.skippedExisting++
        continue
      }
      await db.holiday.create({
        data: {
          name: h.name,
          date: wibDateToUtcMidnight(h.date),
          description: h.estimated
            ? "Sinkron otomatis (estimasi kalender) — verifikasi SKB 3 Menteri"
            : "Sinkron otomatis kalender nasional",
        },
      })
      existingDates.add(h.date)
      existingNames.add(h.name.trim().toLowerCase())
      yearReport.inserted.push(h)
      if (h.estimated) report.estimatedInserted.push(h)
    }
    report.years.push(yearReport)
    report.totalInserted += yearReport.inserted.length
  }

  return report
}

/**
 * Sinkronkan libur nasional hasil generator kalender ke tabel holidays.
 *
 * Konservatif dengan sengaja:
 * - Hanya MENAMBAH yang belum ada; tidak pernah mengubah/menghapus
 *   baris yang sudah ada, jadi koreksi HR atas estimasi (mis. tanggal
 *   Idul Fitri resmi SKB) tidak akan ditimpa sinkronisasi berikutnya.
 * - Duplikat dicegah per tanggal ATAU per nama dalam tahun yang sama:
 *   bila SKB menggeser Idul Fitri sehari dari estimasi Umm al-Qura,
 *   nama yang sama di tahun itu dianggap sudah terpasang dan estimasi
 *   yang meleset tidak ikut masuk sebagai baris kedua.
 *
 * Anti-dobel konkuren: tanpa unique DB pada (date, name), dua run
 * bersamaan sama-sama membaca "belum ada" lalu sama-sama create.
 * Seluruh sinkronisasi dibungkus SATU transaksi serializable dengan
 * kunci baris `system_settings ... FOR UPDATE` sebagai mutex global
 * (pola taskLockPeriod cron): run kedua membaca existing SESUDAH run
 * pertama commit, sehingga skip-existing bekerja antar-run.
 */
export async function syncNationalHolidays(
  years: number[],
  db: Db = prisma,
): Promise<HolidaySyncReport> {
  const txDb = db as Partial<TxDb>
  if (typeof txDb.$transaction !== "function") {
    return syncYears(years, db)
  }

  return txDb.$transaction(
    async (tx) => {
      // Guard sama seperti hooks repo: stub tx tanpa $queryRaw tidak pecah;
      // isolasi serializable tetap jadi penjaga utama.
      if (typeof tx.$queryRaw === "function") {
        await tx.$queryRaw`
          SELECT id FROM system_settings ORDER BY id LIMIT 1 FOR UPDATE
        `
      }
      return syncYears(years, tx)
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
}
