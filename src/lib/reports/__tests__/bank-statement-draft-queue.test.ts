import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

import {
  BANK_STATEMENT_DRAFT_BUCKET_LABELS,
  BANK_STATEMENT_DRAFT_LEVEL_LABELS,
  BANK_STATEMENT_DRAFT_MENGENDAP_MIN_DAYS,
  BANK_STATEMENT_DRAFT_NOMINAL_LABEL,
  BANK_STATEMENT_DRAFT_QUEUE_LIMIT,
  BANK_STATEMENT_DRAFT_QUEUE_TITLE,
  buildBankStatementDraftQueue,
  type BankStatementDraftInput,
} from "../bank-statement-draft-queue"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  statementFindMany: vi.fn(),
  lineFindMany: vi.fn(),
  itemFindMany: vi.fn(),
  accountFindMany: vi.fn(),
  userFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    bankStatement: { findMany: (...a: unknown[]) => mocks.statementFindMany(...a) },
    bankStatementLine: { findMany: (...a: unknown[]) => mocks.lineFindMany(...a) },
    bankReconciliationItem: { findMany: (...a: unknown[]) => mocks.itemFindMany(...a) },
    account: { findMany: (...a: unknown[]) => mocks.accountFindMany(...a) },
    user: { findMany: (...a: unknown[]) => mocks.userFindMany(...a) },
  },
}))

import { getBankStatementDraftQueue } from "../bank-statement-draft-queue-data"

// 27 Okt 2026 12:00 WIB (= 05:00 UTC); hari kalender WIB stabil.
const NOW = new Date("2026-10-27T05:00:00.000Z")
const day = (offset: number) => new Date(Date.UTC(2026, 9, 27 + offset, 5, 0, 0))

function line(over: Partial<BankStatementDraftInput["lines"][number]> = {}) {
  return { lineId: 1, status: "unmatched", hasMatchedReconciliationItem: false, ...over }
}

function input(over: Partial<BankStatementDraftInput> = {}): BankStatementDraftInput {
  return {
    statementId: 1,
    slug: "koran-1",
    status: "draft",
    deletedAt: null,
    accountId: 10,
    accountCode: "110201",
    accountName: "Bank BCA",
    accountNumber: "1234567890",
    date: day(-1),
    reference: "REF-1",
    periodStart: day(-30),
    periodEnd: day(-1),
    openingBalance: 1_000_000,
    closingBalance: 1_500_000,
    totalDebits: 700_000,
    totalCredits: 200_000,
    createdAt: day(-1),
    updatedAt: day(-1),
    uploadedBy: 7,
    uploadedByName: "Staf Keuangan",
    lines: [],
    ...over,
  }
}

describe("bank-statement-draft-queue (F-2026-10-27-096-S)", () => {
  it("kata verbatim Q-BSQ-1/2 + ambang dan label nominal bernama", () => {
    expect(BANK_STATEMENT_DRAFT_QUEUE_TITLE).toBe("Rekening Koran Draft Mengendap")
    expect(BANK_STATEMENT_DRAFT_BUCKET_LABELS).toEqual({
      belum_ada_baris: "Belum Ada Baris",
      belum_semua_tercocokkan: "Belum Semua Tercocokkan",
    })
    expect(BANK_STATEMENT_DRAFT_LEVEL_LABELS).toEqual({
      mengendap: "Mengendap",
      menunggu: "Menunggu",
    })
    expect(BANK_STATEMENT_DRAFT_MENGENDAP_MIN_DAYS).toBe(3)
    expect(BANK_STATEMENT_DRAFT_NOMINAL_LABEL).toBe("tercatat di rekening koran")
    expect(BANK_STATEMENT_DRAFT_QUEUE_LIMIT).toBeGreaterThan(0)
  })

  it("AC-BSQ-B1: populasi persis draft; non-draft/deleted/semua-tercocokkan bocor = merah", () => {
    const q = buildBankStatementDraftQueue(
      [
        input({ statementId: 1, lines: [] }),
        input({ statementId: 2, status: "completed", lines: [] }),
        input({ statementId: 3, status: "karangan", lines: [] }),
        input({ statementId: 4, deletedAt: day(0), lines: [] }),
        input({
          statementId: 5,
          lines: [line({ lineId: 51, status: "matched" })],
        }),
        input({
          statementId: 6,
          lines: [line({ lineId: 61, status: "unmatched" })],
        }),
      ],
      NOW,
    )
    expect(q.rows.map((r) => r.statementId)).toEqual([1, 6])
    expect(q.totalPopulation).toBe(2)
  })

  it("AC-BSQ-B1: dua ember terpisah terhitung; digabung tanpa pemisah = merah", () => {
    const q = buildBankStatementDraftQueue(
      [
        input({ statementId: 1, lines: [], createdAt: day(-5) }),
        input({ statementId: 2, lines: [], createdAt: day(-4) }),
        input({
          statementId: 3,
          createdAt: day(-3),
          lines: [
            line({ lineId: 31, status: "matched" }),
            line({ lineId: 32, status: "unmatched" }),
          ],
        }),
      ],
      NOW,
    )
    expect(q.bucketCounts).toEqual({ belum_ada_baris: 2, belum_semua_tercocokkan: 1 })
    const partial = q.rows.find((r) => r.statementId === 3)
    expect(partial).toMatchObject({
      ember: "belum_semua_tercocokkan",
      emberLabel: "Belum Semua Tercocokkan",
      totalLineCount: 2,
      matchedLineCount: 1,
      remainingLineCount: 1,
    })
    expect(q.rows.find((r) => r.statementId === 1)).toMatchObject({
      ember: "belum_ada_baris",
      emberLabel: "Belum Ada Baris",
      totalLineCount: 0,
      remainingLineCount: 0,
    })
  })

  it("AC-BSQ-B2: definisi ganda dua arah; satu sumber saja pada fixture campuran = merah", () => {
    const q = buildBankStatementDraftQueue(
      [
        input({
          statementId: 1,
          lines: [
            // Tercocokkan hanya lewat item rekonsiliasi.
            line({ lineId: 11, status: "unmatched", hasMatchedReconciliationItem: true }),
            // Tercocokkan hanya lewat status baris.
            line({ lineId: 12, status: "matched", hasMatchedReconciliationItem: false }),
            line({ lineId: 13, status: "unmatched", hasMatchedReconciliationItem: false }),
          ],
        }),
      ],
      NOW,
    )
    expect(q.rows).toHaveLength(1)
    expect(q.rows[0]).toMatchObject({ totalLineCount: 3, matchedLineCount: 2, remainingLineCount: 1 })

    // Semua tercocokkan hanya lewat item -> keluar populasi.
    const viaItemOnly = buildBankStatementDraftQueue(
      [
        input({
          statementId: 2,
          lines: [line({ lineId: 21, status: "unmatched", hasMatchedReconciliationItem: true })],
        }),
      ],
      NOW,
    )
    expect(viaItemOnly.rows).toEqual([])
    // Semua tercocokkan hanya lewat status baris -> keluar populasi.
    const viaStatusOnly = buildBankStatementDraftQueue(
      [input({ statementId: 3, lines: [line({ lineId: 31, status: "matched" })] })],
      NOW,
    )
    expect(viaStatusOnly.rows).toEqual([])
  })

  it("EC-BSQ-5: satu baris dipakai dua rekonsiliasi dihitung tercocokkan satu kali", () => {
    const q = buildBankStatementDraftQueue(
      [
        input({
          statementId: 1,
          lines: [
            line({ lineId: 11, status: "unmatched", hasMatchedReconciliationItem: true }),
            line({ lineId: 12, status: "unmatched" }),
          ],
        }),
      ],
      NOW,
    )
    expect(q.rows[0].matchedLineCount).toBe(1)
    expect(q.rows[0].remainingLineCount).toBe(1)
    expect(q.rows[0].remainingLineCount).toBeGreaterThanOrEqual(0)
  })

  it("EC-BSQ-8: debit=kredit seimbang tanpa kecocokan tetap sisa penuh", () => {
    const q = buildBankStatementDraftQueue(
      [
        input({
          statementId: 1,
          totalDebits: 500_000,
          totalCredits: 500_000,
          lines: [line({ lineId: 11 }), line({ lineId: 12 })],
        }),
      ],
      NOW,
    )
    expect(q.rows[0]).toMatchObject({ ember: "belum_semua_tercocokkan", remainingLineCount: 2 })
    expect(JSON.stringify(q.rows[0])).not.toMatch(/siap/i)
  })

  it("AC-BSQ-B3: payload tanpa filePath/notes dan tanpa label terlarang; nominal byte-sama header", () => {
    const q = buildBankStatementDraftQueue(
      [input({ openingBalance: 123_456, closingBalance: 654_321, totalDebits: 111, totalCredits: 222 })],
      NOW,
    )
    const row = q.rows[0]
    expect(row).toMatchObject({
      openingBalance: 123_456,
      closingBalance: 654_321,
      totalDebits: 111,
      totalCredits: 222,
      nominalLabel: "tercatat di rekening koran",
    })
    for (const key of ["filePath", "notes", "updatedAt"]) {
      expect(row).not.toHaveProperty(key)
    }
    const serialized = JSON.stringify(q)
    expect(serialized).not.toMatch(/filePath/)
    expect(serialized).not.toMatch(/saldo buku|saldo seharusnya/i)
    expect(serialized).not.toMatch(/selisih/i)
    expect(serialized).not.toMatch(/siap selesai|siap-selesai|kesiapan selesai/i)
    // Rekap hitungan saja: nominal tidak dijumlahkan lintas koran.
    expect(q).not.toHaveProperty("totalNominal")
    expect(Object.keys(q.bucketCounts)).toEqual(["belum_ada_baris", "belum_semua_tercocokkan"])
  })

  it("AC-BSQ-B4: umur dari createdAt WIB walau updatedAt jauh lebih baru; date lampau tidak menua-kan", () => {
    const q = buildBankStatementDraftQueue(
      [
        input({
          statementId: 1,
          date: day(-365),
          createdAt: day(-10),
          updatedAt: day(0),
        }),
        input({ statementId: 2, date: day(-365), createdAt: day(0), updatedAt: day(-300) }),
      ],
      NOW,
    )
    const byId = new Map(q.rows.map((r) => [r.statementId, r]))
    expect(byId.get(1)).toMatchObject({ umurHari: 10, tingkat: "mengendap", tingkatLabel: "Mengendap" })
    expect(byId.get(2)).toMatchObject({ umurHari: 0, tingkat: "menunggu" })
  })

  it("AC-BSQ-B4: batas Mengendap tepat 3 hari; masa depan 0 tertanda; urutan createdAt naik seri id naik", () => {
    const q = buildBankStatementDraftQueue(
      [
        input({ statementId: 9, createdAt: day(-2) }),
        input({ statementId: 3, createdAt: day(-2) }),
        input({ statementId: 7, createdAt: day(-3) }),
        input({ statementId: 8, createdAt: day(1) }),
      ],
      NOW,
    )
    expect(q.rows.map((r) => r.statementId)).toEqual([7, 3, 9, 8])
    const byId = new Map(q.rows.map((r) => [r.statementId, r]))
    expect(byId.get(7)?.tingkat).toBe("mengendap")
    expect(byId.get(3)?.tingkat).toBe("menunggu")
    expect(byId.get(8)).toMatchObject({ umurHari: 0, umurDariMasaDepan: true })
    expect(q.levelCounts).toEqual({ mengendap: 1, menunggu: 3 })
  })

  it("BR-BSQ-10: rekap populasi penuh walau tampil terpotong", () => {
    const inputs = [
      input({ statementId: 1, createdAt: day(-10), lines: [] }),
      input({ statementId: 2, createdAt: day(-9), lines: [line({ lineId: 21 })] }),
      input({ statementId: 3, createdAt: day(-1), lines: [] }),
    ]
    const q = buildBankStatementDraftQueue(inputs, NOW, 1)
    expect(q.rows.map((r) => r.statementId)).toEqual([1])
    expect(q.terpotong).toBe(true)
    expect(q.truncated).toBe(true)
    expect(q.totalPopulation).toBe(3)
    expect(q.displayedCount).toBe(1)
    expect(q.bucketCounts).toEqual({ belum_ada_baris: 2, belum_semua_tercocokkan: 1 })
    expect(q.levelCounts).toEqual({ mengendap: 2, menunggu: 1 })
  })

  it("EC-BSQ-6: koran 0 baris bernominal header bukan nol tampil verbatim tanpa tanda salah", () => {
    const q = buildBankStatementDraftQueue(
      [input({ statementId: 1, lines: [], openingBalance: 9_999, closingBalance: 9_999 })],
      NOW,
    )
    expect(q.rows[0]).toMatchObject({ openingBalance: 9_999, ember: "belum_ada_baris" })
  })
})

describe("getBankStatementDraftQueue (loader fail-closed, AC-BSQ-B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 1 })
    mocks.statementFindMany.mockResolvedValue([])
    mocks.lineFindMany.mockResolvedValue([])
    mocks.itemFindMany.mockResolvedValue([])
    mocks.accountFindMany.mockResolvedValue([])
    mocks.userFindMany.mockResolvedValue([])
  })

  it("tanpa izin menolak SEBELUM query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getBankStatementDraftQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_bank_statements")
    expect(mocks.statementFindMany).not.toHaveBeenCalled()
    expect(mocks.lineFindMany).not.toHaveBeenCalled()
  })

  it("query massal anti-N+1; select tanpa filePath/notes/updatedAt; nominal verbatim", async () => {
    mocks.statementFindMany.mockResolvedValue([
      {
        id: 5, slug: "koran-5", status: "draft", deletedAt: null, accountId: 10,
        accountNumber: "999", date: day(-1), reference: "REF-5",
        periodStart: null, periodEnd: null,
        openingBalance: 1000, closingBalance: 1500, totalDebits: 700, totalCredits: 200,
        uploadedBy: 7, createdAt: day(-10), updatedAt: day(0),
      },
      {
        id: 6, slug: "koran-6", status: "draft", deletedAt: null, accountId: 10,
        accountNumber: null, date: day(-1), reference: null,
        periodStart: null, periodEnd: null,
        openingBalance: 0, closingBalance: 0, totalDebits: 0, totalCredits: 0,
        uploadedBy: null, createdAt: day(-1),
      },
    ])
    mocks.lineFindMany.mockResolvedValue([
      { id: 51, bankStatementId: 5, status: "unmatched" },
      { id: 52, bankStatementId: 5, status: "matched" },
    ])
    // Baris 51 tercocokkan lewat item; baris yang sama tidak dihitung dua kali.
    mocks.itemFindMany.mockResolvedValue([
      { bankStatementLineId: 51 },
      { bankStatementLineId: 51 },
    ])
    mocks.accountFindMany.mockResolvedValue([{ id: 10, code: "110201", name: "Bank BCA" }])
    mocks.userFindMany.mockResolvedValue([{ id: 7, name: "Staf Keuangan" }])

    const q = await getBankStatementDraftQueue({ now: NOW })

    expect(mocks.statementFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.lineFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.itemFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.accountFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1)

    const stmtArg = mocks.statementFindMany.mock.calls[0][0]
    expect(stmtArg.where).toEqual({ status: "draft", deletedAt: null })
    for (const key of ["filePath", "notes", "updatedAt"]) {
      expect(stmtArg.select).not.toHaveProperty(key)
    }
    expect(mocks.itemFindMany.mock.calls[0][0].where).toEqual({
      bankStatementLineId: { in: [51, 52] },
      matched: true,
    })

    // Koran 5 semua baris tercocokkan (51 via item, 52 via status) -> keluar.
    expect(q.rows.map((r) => r.statementId)).toEqual([6])
    expect(q.rows[0]).toMatchObject({ ember: "belum_ada_baris", accountName: "Bank BCA" })
    expect(q.rows[0]).not.toHaveProperty("filePath")
    expect(q.rows[0]).not.toHaveProperty("updatedAt")
  })

  it("umur loader dari createdAt walau baris sumber membawa updatedAt hari ini", async () => {
    mocks.statementFindMany.mockResolvedValue([
      {
        id: 7, slug: "koran-7", status: "draft", deletedAt: null, accountId: 99,
        accountNumber: null, date: day(-90), reference: null,
        periodStart: null, periodEnd: null,
        openingBalance: 100, closingBalance: 100, totalDebits: 0, totalCredits: 0,
        uploadedBy: null, createdAt: day(-7), updatedAt: day(0),
      },
    ])
    mocks.lineFindMany.mockResolvedValue([{ id: 71, bankStatementId: 7, status: "unmatched" }])
    mocks.itemFindMany.mockResolvedValue([])
    mocks.accountFindMany.mockResolvedValue([])
    const q = await getBankStatementDraftQueue({ now: NOW })
    expect(q.rows[0]).toMatchObject({ umurHari: 7, tingkat: "mengendap", accountName: null })
  })

  it("tanpa draft: baris/item/akun/pengguna tidak ditanyakan sama sekali", async () => {
    const q = await getBankStatementDraftQueue({ now: NOW })
    expect(q.rows).toEqual([])
    expect(mocks.lineFindMany).not.toHaveBeenCalled()
    expect(mocks.itemFindMany).not.toHaveBeenCalled()
    expect(mocks.accountFindMany).not.toHaveBeenCalled()
    expect(mocks.userFindMany).not.toHaveBeenCalled()
  })
})

describe("wiring permukaan antrean rekening koran (AC-BSQ-B5/F1..F3)", () => {
  const root = process.cwd()
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8")
  const builderSource = read("src/lib/reports/bank-statement-draft-queue.ts")
  const loaderSource = read("src/lib/reports/bank-statement-draft-queue-data.ts")
  const uiSource = read(
    "src/app/(dashboard)/keuangan/laporan-bank/_components/bank-statement-draft-queue.tsx",
  )
  const pageSource = read("src/app/(dashboard)/keuangan/laporan-bank/page.tsx")

  it("AC-BSQ-B5: builder+loader baca-saja — tanpa aksi tulis koran/baris/rekonsiliasi/jurnal", () => {
    const sources = builderSource + loaderSource
    expect(sources).not.toMatch(
      /createBankStatement|updateBankStatement|deleteBankStatement|matchReconciliationLine|completeReconciliation/,
    )
    expect(loaderSource).not.toMatch(/\.update\(|\.create\(|\.delete\(|updateMany|journal/i)
    expect(loaderSource).toContain('requirePermission("view_bank_statements")')
    expect(loaderSource).toContain('status: "draft", deletedAt: null')
    expect(loaderSource).not.toContain("filePath: true")
  })

  it("AC-BSQ-B3: label terlarang tidak tampil pada builder/loader/UI", () => {
    const surfaces = builderSource + loaderSource + uiSource
    expect(surfaces).not.toMatch(/saldo buku|saldo seharusnya/i)
    expect(surfaces).not.toMatch(/selisih/i)
    expect(surfaces).not.toMatch(/siap selesai|siap-selesai/i)
    expect(builderSource).toContain('"tercatat di rekening koran"')
  })

  it("AC-BSQ-F1: UI verbatim payload — tanpa hitung umur/sisa/tingkat/ember sendiri", () => {
    expect(uiSource).not.toMatch(/wibDayNumber|getTime\(\)|86400|86_400/)
    expect(uiSource).not.toMatch(/status === "matched"|hasMatchedReconciliationItem/)
    expect(uiSource).toContain("BANK_STATEMENT_DRAFT_QUEUE_TITLE")
    expect(uiSource).toContain("row.umurLabel")
    expect(uiSource).toContain("row.tingkatLabel")
    expect(uiSource).toContain("row.emberLabel")
    expect(uiSource).toContain("row.remainingLineCount")
    expect(uiSource).toContain("queue.bucketCounts")
    expect(uiSource).toContain("row.nominalLabel")
  })

  it("AC-BSQ-F1: dua ember tampil sebagai seksi terpisah berlabel verbatim", () => {
    expect(uiSource).toContain("BANK_STATEMENT_DRAFT_BUCKETS")
    expect(uiSource).toContain("BANK_STATEMENT_DRAFT_BUCKET_LABELS")
    expect(builderSource).toContain('"Belum Ada Baris"')
    expect(builderSource).toContain('"Belum Semua Tercocokkan"')
    expect(builderSource).toContain('"Rekening Koran Draft Mengendap"')
  })

  it("AC-BSQ-F2/F3: tanpa tombol tulis dari antrean; tautan hanya ke detail koran existing", () => {
    expect(uiSource).not.toMatch(/<button|onClick=|onPress=/)
    expect(uiSource).not.toMatch(
      /Tambah Baris|Cocokkan|Selesaikan|deleteBankStatementLine|createBankStatementLine/,
    )
    expect(uiSource).toContain('entityHref("/keuangan/laporan-bank"')
    expect(uiSource).not.toMatch(/baris\/tambah|rekonsiliasi-bank/)
    expect(pageSource).toContain("getBankStatementDraftQueue")
    expect(pageSource).toContain("BankStatementDraftQueueSection")
    // Daftar existing tidak diubah: urutan dan paginasi existing tetap.
    expect(pageSource).toContain('orderBy: { createdAt: "desc" }')
    expect(pageSource).toContain("perPage = 20")
  })
})
