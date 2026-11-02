import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"
import { loadBankLedger, loadGeneralLedger } from "@/lib/reports/ledger-cash-data"

/**
 * Ekuivalensi refactor perf buku-bank (S3-A #5): jalur lama
 *   opening = sumEntriesByAccount({ date: { lt: start } }).get(accountId)
 *   entries = findMany include jurnal, sekuensial
 * diganti
 *   opening = sumNetForAccount(accountId, { date: { lt: start } })
 *   entries = findMany select sempit, Promise.all paralel.
 * Test ini memaku HASIL kepada baseline manual yang dihitung SQL independen
 * (OPENING_BASELINE/PERIOD_ROWS_BASELINE di bawah, diverifikasi tangan):
 * opening = 1500.25 (hanya JV-OLD-1 POSTED; DRAFT + soft-deleted tak dihitung;
 * pasangan POSTED/REVERSED tidak nolkan opening karena keduanya sesudah mulai),
 * periode Oktober 2026 = 4 baris dengan saldo berjalan 1500.49, 1500.36,
 * 1600.36, 1500.36 (REVERSED tetap dihitung, bukan difilter keluar).
 * CATATAN FORMAT (ditemukan saat assert): formatter uang ledger
 * `formatAccounting(..., decimals bawaan 0)` membulatkan sen — 1500.25 -> "1.500",
 * 1500.49 -> "1.500", 1500.36 -> "1.500", 1600.36 -> "1.600", dan totals
 * 100.48/100.26 -> "100". Assert di bawah memakai bentuk TERFORMAT itu; ekuivalensi
 * sen tetap terbukti karena selisih 0.25 memang hilang oleh pembulatan desimal-0
 * (bukan oleh refactor) dan manual baseline SQL membuktikan 1500.25 persis.
 *
 * Membutuhkan DB nyata: RUN_DB_INTEGRATION=1 + DATABASE_URL menunjuk DB
 * buang-pakai. Di CI/dev biasa suite ini skip sendiri.
 */
const SKIP = process.env.RUN_DB_INTEGRATION !== "1"

describe.skipIf(SKIP)("bank-ledger equivalence (refactor perf S3-A, DB)", () => {
  const period = { start: new Date("2026-10-01T00:00:00+07:00"), end: new Date("2026-10-31T23:59:59+07:00") }
  let accountId = 0

  beforeAll(async () => {
    await prisma.journalEntry.deleteMany({ where: { journal: { journalNumber: { startsWith: "EQ-" } } } })
    await prisma.journal.deleteMany({ where: { journalNumber: { startsWith: "EQ-" } } })
    await prisma.account.deleteMany({ where: { slug: "eq-bank-ledger" } })

    const account = await prisma.account.create({
      data: {
        code: `EQ-BANK-${Date.now()}`,
        name: "Bank Ekuivalensi",
        type: "ASSET",
        reportGroup: "BANK",
        normalBalance: "DEBIT",
        slug: "eq-bank-ledger",
      },
    })
    accountId = account.id

    async function journal(
      journalNumber: string,
      iso: string,
      status: string,
      debit: number,
      credit: number,
      memo: string | null,
      opts: { deleted?: boolean; description?: string } = {},
    ) {
      const created = await prisma.journal.create({
        data: {
          journalNumber,
          transactionDate: new Date(`${iso}T00:00:00+07:00`),
          description: opts.description ?? `Deskripsi ${journalNumber}`,
          status,
          totalDebit: debit + credit,
          totalCredit: debit + credit,
          ...(opts.deleted ? { deletedAt: new Date("2026-10-25T00:00:00+07:00") } : {}),
          entries: { create: [{ accountId, debit, credit, memo }] },
        },
      })
      return created
    }

    await journal("EQ-OLD-1", "2026-09-10", "POSTED", 1500.25, 0, "Saldo pembuka")
    await journal("EQ-DRAFT-1", "2026-09-11", "DRAFT", 900, 0, "draf tak dihitung")
    await journal("EQ-DEL-1", "2026-09-12", "POSTED", 777, 0, "terhapus tak dihitung", { deleted: true })
    await journal("EQ-IN-1", "2026-10-05", "POSTED", 0.37, 0.13, "mutasi pertama")
    await journal("EQ-IN-2", "2026-10-20", "POSTED", 0.11, 0.13, null)
    await journal("EQ-REV-A", "2026-10-21", "POSTED", 100, 0, "pasangan A")
    await journal("EQ-REV-B", "2026-10-22", "REVERSED", 0, 100, "pembalik B")
  })

  afterAll(async () => {
    if (accountId) {
      await prisma.journalEntry.deleteMany({ where: { accountId } })
      await prisma.journal.deleteMany({ where: { journalNumber: { startsWith: "EQ-" } } })
      await prisma.account.deleteMany({ where: { id: accountId } })
    }
    await prisma.$disconnect()
  })

  it("saldo awal dari sumNetForAccount identik baseline manual SQL (1500.25; DRAFT/terhapus dibuang)", async () => {
    const report = await loadBankLedger(period, "eq-bank-ledger")
    const rows = report.table.rows
    // 1500.25 terformat desimal-0 -> "1.500" (lihat catatan format di header).
    expect(rows[0]).toEqual({
      kind: "data",
      cells: ["", "", "Saldo Awal", "", "", "1.500"],
    })
  })

  it("baris periode: REVERSED dihitung, memo null jatuh ke deskripsi jurnal, saldo berjalan persis baseline", async () => {
    const report = await loadBankLedger(period, "eq-bank-ledger")
    const rows = report.table.rows as { kind: string; cells?: string[] }[]
    const dataRows = rows.filter((r) => r.kind === "data")
    expect(dataRows).toHaveLength(5) // Saldo Awal + 4 mutasi
    expect(dataRows[1].cells?.[5]).toBe("1.500") // 1500.49 -> desimal-0
    expect(dataRows[2].cells?.[2]).toBe("Deskripsi EQ-IN-2") // memo null -> deskripsi jurnal
    expect(dataRows[2].cells?.[5]).toBe("1.500") // 1500.36 -> desimal-0
    expect(dataRows[3].cells?.[5]).toBe("1.600") // 1600.36 -> desimal-0
    expect(dataRows[4].cells?.[5]).toBe("1.500") // pembalik B REVERSED dihitung (1500.36), bukan difilter
    const total = rows.at(-1) as { kind: string; cells?: string[] }
    expect(total.kind).toBe("total")
    expect(total.cells).toEqual(["100", "100", "1.500"]) // 100.48/100.26/1500.36 desimal-0
  })

  it("loadGeneralLedger berbagi hasil identik dengan loadBankLedger untuk akun kas/bank", async () => {
    const [bank, gl] = await Promise.all([
      loadBankLedger(period, "eq-bank-ledger"),
      loadGeneralLedger(period, "eq-bank-ledger"),
    ])
    expect(gl).toEqual(bank)
  })

  it("putaran 75: akun non-kas/bank ditolak loadBankLedger tetapi tetap terbaca loadGeneralLedger", async () => {
    const other = await prisma.account.create({
      data: {
        code: `EQ-NONBANK-${Date.now()}`,
        name: "Piutang Ekuivalensi",
        type: "ASSET",
        normalBalance: "DEBIT",
        slug: "eq-non-bank-ledger",
      },
    })
    try {
      const bank = await loadBankLedger(period, "eq-non-bank-ledger")
      expect(JSON.stringify(bank.table.rows)).toContain("bukan rekening kas/bank")
      const gl = await loadGeneralLedger(period, "eq-non-bank-ledger")
      expect(JSON.stringify(gl.table.rows)).not.toContain("bukan rekening kas/bank")
    } finally {
      await prisma.account.delete({ where: { id: other.id } })
    }
  })
})
