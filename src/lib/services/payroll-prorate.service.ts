/**
 * R8-SDM-05: prorate gaji pokok slip gaji parsial.
 *
 * Keputusan desain (menggantikan penangguhan "butuh vonis bisnis"):
 * - Slip yang periode slipnya TIDAK utuh (karyawan belum bergabung di awal
 *   periode, atau sudah berhenti sebelum akhir periode, atau kenaikan gaji
 *   berlaku di tengah periode) dihitung per HARI KALENDER — denominasi
 *   paling transparan dan dapat diaudit dari kalender saja, tanpa
 *   asumsi pola shift. Nilai penuh sebulan tetap untuk slip utuh.
 * - Kenaikan tengah periode TIDAK dibelah menjadi dua slip (satu slip
 *   per karyawan per periode adalah invarian repo: koreksi slip,
 *   agregator BPJS/PPh21 se-masa, dan klaim atomik semuanya mengasumsi
 *   itu); nilainya DIBLEND dalam slip yang sama menurut hari efektif.
 * - Nominal master mengikuti frekuensi karyawan (form karyawan:
 *   WEEKLY = "Per Minggu", MONTHLY = "Per Bulan"), jadi denominator
 *   prorate ikut frekuensi: MONTHLY dibagi hari kalender bulan periodEnd
 *   (slip bulanan utuh = nominal persis; gabung 16 Nov = 15/30), WEEKLY
 *   dibagi 7 (minggu utuh = nominal persis; gabung tengah minggu = n/7).
 *   Slip utuh tanpa batas selalu persis nominal master.
 */

const DAY_MS = 86_400_000

/** Jumlah hari kalender inklusif rentang [start, end] pada UTC midnight. */
export function calendarDaysInclusive(start: Date, end: Date): number {
  const a = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const b = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  return Math.max(0, Math.floor((b - a) / DAY_MS) + 1)
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/**
 * Loader as-of: gaji yang berlaku PADA `asOf`, diturunkan dari rantai
 * SalaryAdjustment terapan (applied). Sebelum kenaikan terapan pertama,
 * gaji = `previousBaseSalary` kenaikan itu (snapshot yang distempel
 * `applyDueSalaryAdjustments`); tanpa kenaikan terapan, gaji master
 * berjalan adalah satu-satunya fakta dan berlaku mundur.
 */
export async function loadSalaryHistoryAsOf(
  db: Pick<typeof import("@/lib/db/prisma").prisma, "salaryAdjustment">,
  employeeId: number,
  currentBaseSalary: number,
  asOf: Date,
): Promise<{ salaryBefore: number; adjustments: { effectiveDate: Date; newBaseSalary: number }[] }> {
  // Seluruh rantai terapan dibaca (bukan hanya <= asOf): gaji SEBELUM
  // kenaikan pertama hanya tercatat sebagai previousBaseSalary pada
  // baris kenaikan itu, yang bisa efektif SESUDAH asOf (lembur lama
  // yang disetujui sesudah kenaikan). adjustments tetap dibatasi asOf.
  const rows = await db.salaryAdjustment.findMany({
    where: { employeeId, status: "applied" },
    orderBy: [{ effectiveDate: "asc" }, { id: "asc" }],
    select: { effectiveDate: true, previousBaseSalary: true, newBaseSalary: true },
  })
  if (rows.length === 0) {
    return { salaryBefore: currentBaseSalary, adjustments: [] }
  }
  return {
    salaryBefore: Number(rows[0].previousBaseSalary ?? currentBaseSalary),
    adjustments: rows
      .filter((r) => r.effectiveDate <= asOf)
      .map((r) => ({
        effectiveDate: r.effectiveDate,
        newBaseSalary: Number(r.newBaseSalary),
      })),
  }
}

/**
 * Gaji yang berlaku dari hasil `loadSalaryHistoryAsOf` (rantai sudah
 * dibatasi ≤ tanggal acuan): kenaikan terapan terakhir dalam rantai,
 * atau `salaryBefore` bila belum ada kenaikan pada tanggal itu.
 */
export function salaryAsOfFromHistory(history: {
  salaryBefore: number
  adjustments: readonly { newBaseSalary: number }[]
}): number {
  const last = history.adjustments[history.adjustments.length - 1]
  return last ? last.newBaseSalary : history.salaryBefore
}

export interface ProrateSegment {
  salary: number
  from: Date
  to: Date
  days: number
}

export interface ProratedBaseSalary {
  /** Gaji pokok terprorate untuk periode slip (dibulatkan rupiah). */
  amount: number
  /** true bila tidak ada pemotongan (periode penuh, tanpa batas gabung/berhenti). */
  isFull: boolean
  /** Rincian untuk jejak audit: total hari periode + hari dibayar. */
  periodDays: number
  paidDays: number
  /**
   * Versi terstruktur untuk disimpan ke snapshot slip: gaji terpilih per
   * rentang hari. Serializable (tanggal ISO string) agar masuk
   * statutorySnapshot JSON tanpa helper tanggal khusus.
   */
  audit: {
    method: "calendar-days"
    segments: { salary: number; from: string; to: string; days: number }[]
  }
}

/**
 * Hitung gaji pokok terprorate untuk satu periode slip.
 *
 * - `periodStart`..`periodEnd` inklusif (UTC midnight).
 * - `joinDate` / `employmentEndedAt`: batas masa kerja dalam periode —
 *   hari di luar [join, endedAt] tidak dibayar. Tanggal berhenti dianggap
 *   hari TERAKHIR bekerja (inklusif), sesuai field `employmentEndedAt`
 *   yang distempel saat status berubah.
 * - `adjustments`: kenaikan gaji yang SUDAH diterapkan sampai akhir
 *   periode, terurut tanggal efektif. `salaryBefore` gaji pertama yang
 *   berlaku di awal segmen berjalan (master sebelum kenaikan pertama
 *   dalam periode, atau gaji berjalan bila tidak ada kenaikan).
 */
export function prorateBaseSalaryForPeriod(input: {
  periodStart: Date
  periodEnd: Date
  monthlyBaseSalary: number
  /** Frekuensi master: menentukan denominator (bulan kalender vs 7 hari). */
  frequency?: "MONTHLY" | "WEEKLY"
  joinDate: Date | null
  employmentEndedAt: Date | null
  /**
   * Rantai kenaikan terapan sampai akhir periode (dari
   * `loadSalaryHistoryAsOf`): `salaryBefore` = gaji sebelum kenaikan
   * pertama rantai; tiap `newBaseSalary` berlaku dari `effectiveDate`.
   */
  salaryBefore?: number
  adjustments?: readonly { effectiveDate: Date; newBaseSalary: number }[]
}): ProratedBaseSalary {
  const { periodStart, periodEnd } = input
  const periodDays = calendarDaysInclusive(periodStart, periodEnd)

  const workStart = input.joinDate && input.joinDate > periodStart ? input.joinDate : periodStart
  const workEnd =
    input.employmentEndedAt && input.employmentEndedAt < periodEnd ? input.employmentEndedAt : periodEnd
  const paidDays = calendarDaysInclusive(workStart, workEnd)

  if (paidDays <= 0 || periodDays <= 0) {
    return {
      amount: 0,
      isFull: false,
      periodDays,
      paidDays: 0,
      audit: { method: "calendar-days", segments: [] },
    }
  }

  // Segmen harga: gaji berlaku per sub-rentang di dalam [workStart, workEnd].
  // Kenaikan di dalam jendela kerja membelah segmen pada tanggal efektifnya;
  // gaji pada workStart ditelusuri dari rantai (bukan dari master, karena
  // master sudah nilai terbaru sesudah applyDueSalaryAdjustments).
  const chain = [...(input.adjustments ?? [])].sort(
    (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime(),
  )
  const inside = chain.filter((a) => a.effectiveDate > workStart && a.effectiveDate <= workEnd)
  let startingSalary = input.salaryBefore ?? input.monthlyBaseSalary
  for (const adj of chain) {
    if (adj.effectiveDate <= workStart) startingSalary = adj.newBaseSalary
  }

  const segments: ProrateSegment[] = []
  let cursor = workStart
  let cursorSalary = startingSalary
  for (const adj of inside) {
    if (adj.effectiveDate > cursor) {
      const segEnd = addUtcDays(adj.effectiveDate, -1)
      segments.push({
        salary: cursorSalary,
        from: cursor,
        to: segEnd,
        days: calendarDaysInclusive(cursor, segEnd),
      })
      cursor = adj.effectiveDate
    }
    cursorSalary = adj.newBaseSalary
  }
  segments.push({
    salary: cursorSalary,
    from: cursor,
    to: workEnd,
    days: calendarDaysInclusive(cursor, workEnd),
  })

  const weighted = segments.reduce((sum, s) => sum + s.salary * s.days, 0)
  // Denominator prorate mengikuti satuan nominal master: MONTHLY = hari
  // kalender DALAM bulan periodEnd (30 untuk November — gaji bulanan penuh
  // tepat untuk periode sebulan penuh, gabung 16 Nov = 15/30); WEEKLY = 7
  // hari (minggu utuh = nominal mingguan persis, gabung tengah minggu = n/7).
  // ponytail: periode MONTHLY yang membentang dua bulan memakai bulan
  // periodEnd. Jalur nyata slip bulanan selalu satu bulan kalender
  // (period = YYYY-MM endDate, periodMatchesEndDate), jadi batas ini
  // tidak tercapai.
  const monthStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 0))
  const referenceDays = input.frequency === "WEEKLY" ? 7 : calendarDaysInclusive(monthStart, monthEnd)
  const amount = Math.round(weighted / referenceDays)
  const isFull = paidDays === periodDays && segments.length === 1 && segments[0].salary === input.monthlyBaseSalary

  return {
    amount,
    isFull,
    periodDays,
    paidDays,
    audit: {
      method: "calendar-days",
      segments: segments.map((s) => ({
        salary: s.salary,
        from: dayKey(s.from),
        to: dayKey(s.to),
        days: s.days,
      })),
    },
  }
}
