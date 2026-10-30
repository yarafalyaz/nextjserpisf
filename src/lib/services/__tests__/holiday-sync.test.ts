import { describe, it, expect, vi, beforeEach } from "vitest"
import { computeNationalHolidays } from "../holiday-calendar.service"
import { syncNationalHolidays } from "../holiday-sync.service"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"

/**
 * Regresi race sync hari libur: tanpa unique DB (date, name), dua run
 * konkuren sama-sama membaca "belum ada" lalu sama-sama create. Fix:
 * seluruh sinkronisasi dalam SATU transaksi serializable dengan kunci
 * baris system_settings FOR UPDATE; run kedua membaca existing sesudah
 * run pertama commit. Mock di bawah berbagi satu "tabel" in-memory dan
 * $transaction mengantrekan callback lewat rantai promise (mutex),
 * persis perilaku kunci baris di MariaDB.
 */

type Row = { name: string; date: Date }

function makeTxDb() {
  const table: Row[] = []
  const created: Row[] = []
  let chain: Promise<unknown> = Promise.resolve()
  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn)
    chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  const holiday = {
    findMany: vi.fn(async (args: { where: { date: { gte: Date; lt: Date } } }) =>
      table
        .filter((r) => r.date >= args.where.date.gte && r.date < args.where.date.lt)
        .map((r) => ({ date: r.date, name: r.name })),
    ),
    create: vi.fn(async (args: { data: Row }) => {
      table.push(args.data)
      created.push(args.data)
      return args.data
    }),
  }
  const queryRaw = vi.fn(async (_strings: unknown, ..._values: unknown[]) => [{ id: 1 }])

  const db = {
    holiday,
    $queryRaw: queryRaw,
    $transaction: vi.fn(
      async (
        fn: (tx: unknown) => Promise<unknown>,
        options?: { isolationLevel?: unknown },
      ) => {
        void options
        return serialize(() => fn({ holiday, $queryRaw: queryRaw }))
      },
    ),
  }
  return { db, table, created, holiday, queryRaw }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("syncNationalHolidays — jalur transaksi (mutex system_settings)", () => {
  it("mengunci baris system_settings FOR UPDATE di dalam tx serializable", async () => {
    const { db, queryRaw } = makeTxDb()

    await syncNationalHolidays([2026], db as never)

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.$transaction.mock.calls[0][1]).toEqual(
      expect.objectContaining({ isolationLevel: "Serializable" }),
    )
    expect(queryRaw).toHaveBeenCalledTimes(1)
    const strings = queryRaw.mock.calls[0][0] as unknown as string[]
    const sql = strings.join(" ")
    expect(sql).toContain("FROM system_settings")
    expect(sql).toContain("FOR UPDATE")
  })

  it("dua run konkuren tidak membuat baris libur ganda", async () => {
    const { db, table, created } = makeTxDb()
    const [first, second] = await Promise.all([
      syncNationalHolidays([2026], db as never),
      syncNationalHolidays([2026], db as never),
    ])

    // Tepat satu run memasukkan; run lain melihat existing dalam tx-nya.
    // (Jumlah absolut mengikuti dedupe lokal tanggal/nama existing, mis.
    // "Idul Fitri" 2 hari hanya terpasang sekali — bukan urusan race ini.)
    expect(first.totalInserted).toBeGreaterThan(0)
    expect(first.totalInserted + second.totalInserted).toBe(created.length)
    expect(table).toHaveLength(created.length)
    const pairs = table.map((r) => `${r.date.toISOString()}|${r.name}`)
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it("run kedua berurutan tidak create duplikat tanggal/nama yang sudah ada", async () => {
    const { db, holiday } = makeTxDb()
    const computed = computeNationalHolidays(2026)

    const first = await syncNationalHolidays([2026], db as never)
    expect(first.totalInserted).toBeGreaterThan(0)
    holiday.create.mockClear()

    const second = await syncNationalHolidays([2026], db as never)
    expect(second.totalInserted).toBe(0)
    expect(second.years[0].skippedExisting).toBe(computed.length)
    expect(holiday.create).not.toHaveBeenCalled()
  })

  it("skip-existing juga berlaku per nama (geser SKB sehari) dalam jalur tx", async () => {
    const { db, table } = makeTxDb()
    const computed = computeNationalHolidays(2026)
    const target = computed[0]
    // Nama sama, tanggal digeser sehari oleh SKB: tetap dianggap terpasang.
    table.push({
      name: target.name,
      date: wibDateToUtcMidnight("2026-06-15"),
    })

    const report = await syncNationalHolidays([2026], db as never)

    expect(report.years[0].inserted.map((h) => h.name)).not.toContain(target.name)
    expect(report.years[0].skippedExisting).toBeGreaterThanOrEqual(1)
  })
})

describe("syncNationalHolidays — jalur lama tanpa $transaction (stub test)", () => {
  it("tetap bekerja: db tanpa $transaction sinkron seperti semula", async () => {
    const table: Row[] = []
    const db = {
      holiday: {
        findMany: vi.fn(async (args: { where: { date: { gte: Date; lt: Date } } }) =>
          table
            .filter((r) => r.date >= args.where.date.gte && r.date < args.where.date.lt)
            .map((r) => ({ date: r.date, name: r.name })),
        ),
        create: vi.fn(async (args: { data: Row }) => {
          table.push(args.data)
          return args.data
        }),
      },
    }
    const computed = computeNationalHolidays(2026)

    const first = await syncNationalHolidays([2026], db as never)
    expect(first.totalInserted).toBe(db.holiday.create.mock.calls.length)

    const second = await syncNationalHolidays([2026], db as never)
    expect(second.totalInserted).toBe(0)
    expect(second.years[0].skippedExisting).toBe(computed.length)
    expect(db.holiday.create).toHaveBeenCalledTimes(first.totalInserted)
  })
})
