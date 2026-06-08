import { prisma } from "@/lib/db/prisma"

export interface HolidaySyncResult {
  year: number
  fetched: number
  created: number
  skipped: number
  source: string
}

// Primary: static, always-updated JSON of Indonesian national holidays.
// Fallback: the hosted API (may be rate-limited/offline).
const SOURCES = [
  "https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/holidays.json",
]

type RawHolidays = Record<string, { summary?: string }>

async function fetchHolidaysJson(): Promise<{ data: RawHolidays; source: string }> {
  let lastError: unknown
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        // Cache for a day; holiday data rarely changes.
        next: { revalidate: 60 * 60 * 24 },
      })
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`)
        continue
      }
      const data = (await res.json()) as RawHolidays
      return { data, source: url }
    } catch (e) {
      lastError = e
    }
  }
  throw new Error(
    `Gagal mengambil data libur nasional dari sumber manapun: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  )
}

/**
 * Sync Indonesian national holidays for a given year into the `holidays` table.
 * Idempotent: existing entries (same date + name) are skipped, so it is safe to
 * run repeatedly. Returns how many were fetched / created / skipped.
 */
export async function syncNationalHolidays(year: number): Promise<HolidaySyncResult> {
  const { data, source } = await fetchHolidaysJson()

  const entries = Object.entries(data)
    .filter(([dateStr]) => dateStr.startsWith(`${year}-`))
    .map(([dateStr, val]) => ({
      dateStr,
      date: new Date(`${dateStr}T00:00:00.000Z`),
      name: (val?.summary || "Hari Libur Nasional").trim(),
    }))
    .filter((e) => !Number.isNaN(e.date.getTime()))

  // Existing holidays in that year, to avoid duplicates.
  const start = new Date(`${year}-01-01T00:00:00.000Z`)
  const end = new Date(`${year}-12-31T23:59:59.999Z`)
  const existing = await prisma.holiday.findMany({
    where: { date: { gte: start, lte: end } },
    select: { date: true, name: true },
  })
  const existingKeys = new Set(
    existing.map((h) => `${new Date(h.date).toISOString().slice(0, 10)}|${h.name}`)
  )

  const toCreate = entries.filter((e) => !existingKeys.has(`${e.dateStr}|${e.name}`))

  if (toCreate.length > 0) {
    await prisma.holiday.createMany({
      data: toCreate.map((e) => ({
        name: e.name,
        date: e.date,
        description: "Disinkronkan otomatis dari kalender libur nasional",
      })),
    })
  }

  return {
    year,
    fetched: entries.length,
    created: toCreate.length,
    skipped: entries.length - toCreate.length,
    source,
  }
}
