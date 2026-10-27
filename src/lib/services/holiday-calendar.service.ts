/**
 * Generator hari libur nasional Indonesia dari aturan kalender.
 *
 * Sumber kebenaran akhir tetap SKB 3 Menteri. Generator ini menutupi
 * tahun-tahun yang SKB-nya belum terbit supaya HR bisa merencanakan
 * lebih awal:
 * - Tanggal tetap Masehi dan hari raya Kristen (komputus Paskah):
 *   eksak, tidak berubah.
 * - Imlek dan Waisak dari kalender Cina (ICU): eksak secara astronomis.
 * - Tanggal Hijriah dari kalender Islam Umm al-Qura (ICU): ESTIMASI.
 *   Penetapan resmi Indonesia memakai hisab MABIMS + rukyatul hilal dan
 *   dapat bergeser 1 hari dari Umm al-Qura (kasus nyata: Idul Fitri
 *   1447H versi SKB 21 Mar 2026, Umm al-Qura 20 Mar). Tandai `estimated`
 *   dan verifikasi begitu SKB terbit — sinkronisasi tidak pernah
 *   menimpa baris yang sudah ada, jadi koreksi HR bersifat permanen.
 * - Nyepi: estimasi dari bulan baru saka (hari sesudah Tilem Kesanga),
 *   juga wajib verifikasi.
 */

export interface ComputedHoliday {
  /** YYYY-MM-DD (kalender WIB) */
  date: string
  name: string
  /** true bila tanggalnya estimasi kalender dan wajib verifikasi SKB. */
  estimated: boolean
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function toKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}

function partsOf(
  date: Date,
  calendar: string,
): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat(`en-u-ca-${calendar}`, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Jakarta",
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { y: get("year"), m: get("month"), d: get("day") }
}

/** Cari tanggal Masehi dalam `year` yang bertepatan dengan (bulan, hari) kalender lain. */
function findCalendarDate(
  year: number,
  calendar: string,
  month: number,
  day: number,
): string | null {
  // Pindai harian sepanjang tahun (maks 366 iterasi; cukup untuk script tahunan).
  for (let t = Date.UTC(year, 0, 1); t <= Date.UTC(year, 11, 31); t += 86_400_000) {
    const p = partsOf(new Date(t), calendar)
    if (p.m === month && p.d === day) {
      const g = new Date(t)
      return toKey(g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate())
    }
  }
  return null
}

/** Komputus Paskah Gregorian (algoritma anonim): tanggal Minggu Paskah. */
function easterSunday(year: number): { m: number; d: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { m: month, d: day }
}

function shiftDate(year: number, month: number, day: number, deltaDays: number): string {
  const t = new Date(Date.UTC(year, month - 1, day) + deltaDays * 86_400_000)
  return toKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** Daftar libur nasional satu tahun Masehi menurut aturan kalender. */
export function computeNationalHolidays(year: number): ComputedHoliday[] {
  const out: ComputedHoliday[] = []
  const fixed: [string, string][] = [
    [`${year}-01-01`, `Tahun Baru ${year} Masehi`],
    [`${year}-05-01`, "Hari Buruh Internasional"],
    [`${year}-06-01`, "Hari Lahir Pancasila"],
    [`${year}-08-17`, "Hari Kemerdekaan Republik Indonesia"],
    [`${year}-12-25`, "Kelahiran Yesus Kristus"],
  ]
  for (const [date, name] of fixed) out.push({ date, name, estimated: false })

  // Kristen: Jumat Agung (Paskah-2), Paskah, Kenaikan (Paskah+39).
  const easter = easterSunday(year)
  const easterKey = toKey(year, easter.m, easter.d)
  out.push(
    { date: shiftDate(year, easter.m, easter.d, -2), name: "Wafat Yesus Kristus", estimated: false },
    { date: easterKey, name: "Kebangkitan Yesus Kristus (Paskah)", estimated: false },
    { date: shiftDate(year, easter.m, easter.d, 39), name: "Kenaikan Yesus Kristus", estimated: false },
  )

  // Imlek: 1/1 kalender Cina. Tahun Kongzili = Masehi + 551.
  const imlek = findCalendarDate(year, "chinese", 1, 1)
  if (imlek) {
    out.push({
      date: imlek,
      name: `Tahun Baru Imlek ${year + 551} Kongzili`,
      estimated: false,
    })
  }

  // Waisak: 15/4 kalender Cina (bulan purnama bulan ke-4).
  const waisak = findCalendarDate(year, "chinese", 4, 15)
  if (waisak) {
    out.push({ date: waisak, name: "Hari Raya Waisak", estimated: false })
  }

  // Nyepi (Tahun Baru Saka = Masehi - 78): estimasi hari sesudah bulan
  // baru kesanga — diproksikan 1/2 kalender Cina di sekitar Maret.
  const nyepiBase = findCalendarDate(year, "chinese", 2, 1)
  if (nyepiBase) {
    out.push({
      date: nyepiBase,
      name: `Hari Suci Nyepi (Tahun Baru Saka ${year - 78})`,
      estimated: true,
    })
  }

  // Hijriah (Umm al-Qura, estimasi): Isra Mikraj 27/7, Idul Fitri 1-2/10,
  // Idul Adha 10/12, Tahun Baru 1/1, Maulid 12/3.
  const hijri: { month: number; day: number; name: string; spanDays?: number }[] = [
    { month: 7, day: 27, name: "Isra Mikraj Nabi Muhammad SAW" },
    { month: 10, day: 1, name: "Idul Fitri", spanDays: 2 },
    { month: 12, day: 10, name: "Idul Adha" },
    { month: 1, day: 1, name: "Tahun Baru Islam" },
    { month: 3, day: 12, name: "Maulid Nabi Muhammad SAW" },
  ]
  for (const h of hijri) {
    const found = findCalendarDate(year, "islamic-umalqura", h.month, h.day)
    if (!found) continue
    const [fy, fm, fd] = found.split("-").map(Number)
    const hijriYear = partsOf(new Date(Date.UTC(fy, fm - 1, fd)), "islamic-umalqura").y
    const label = `${h.name} ${hijriYear} Hijriah`
    out.push({ date: found, name: label, estimated: true })
    if (h.spanDays === 2) {
      out.push({
        date: shiftDate(fy, fm, fd, 1),
        name: label,
        estimated: true,
      })
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date))
}
