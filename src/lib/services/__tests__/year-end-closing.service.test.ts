import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  approvalFindFirst: vi.fn(),
  settingsFindFirst: vi.fn(),
  accountFindFirst: vi.fn(),
  accountFindMany: vi.fn(),
  journalEntryFindMany: vi.fn(),
  profitCenterFindMany: vi.fn(),
  journalFindFirst: vi.fn(),
  journalCreate: vi.fn(),
  journalUpdate: vi.fn(),
  journalUpdateMany: vi.fn(),
  journalEntryCreateMany: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  generateDocumentNumber: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...args: unknown[]) => mocks.generateDocumentNumber(...args),
}))

vi.mock("@/lib/db/prisma", () => {
  const tx = {
    systemSetting: { findFirst: (...a: unknown[]) => mocks.settingsFindFirst(...a) },
    account: {
      findFirst: (...a: unknown[]) => mocks.accountFindFirst(...a),
      findMany: (...a: unknown[]) => mocks.accountFindMany(...a),
    },
    journalEntry: {
      findMany: (...a: unknown[]) => mocks.journalEntryFindMany(...a),
      createMany: (...a: unknown[]) => mocks.journalEntryCreateMany(...a),
    },
    profitCenter: { findMany: (...a: unknown[]) => mocks.profitCenterFindMany(...a) },
    journal: {
      findFirst: (...a: unknown[]) => mocks.journalFindFirst(...a),
      create: (...a: unknown[]) => mocks.journalCreate(...a),
      update: (...a: unknown[]) => mocks.journalUpdate(...a),
      updateMany: (...a: unknown[]) => mocks.journalUpdateMany(...a),
    },
    $queryRaw: (...a: unknown[]) => mocks.queryRaw(...a),
    $executeRaw: (...a: unknown[]) => mocks.executeRaw(...a),
  }
  return {
    prisma: {
      approval: { findFirst: (...a: unknown[]) => mocks.approvalFindFirst(...a) },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
    },
  }
})

import { postYearEndClosing, reverseYearEndClosing } from "@/lib/services/year-end-closing.service"

const RETAINED = { id: 7, name: "Laba Ditahan", type: "EQUITY", isActive: true }

function entry(accountId: number, over: Record<string, unknown> = {}) {
  return {
    accountId,
    profitCenterId: null,
    debit: 0,
    credit: 0,
    journal: { status: "POSTED" },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumber.mockResolvedValue("JRN-2026-0001")
  mocks.approvalFindFirst.mockResolvedValue(null) // tanpa workflow = no-op
  mocks.queryRaw.mockResolvedValue([{ id: 1, period_lock_date: null }])
  mocks.executeRaw.mockResolvedValue(1)
  mocks.journalUpdateMany.mockResolvedValue({ count: 1 })
  mocks.settingsFindFirst.mockResolvedValue({ fiscalYearStartMonth: 1, retainedEarningsAccountId: 7 })
  mocks.accountFindFirst.mockResolvedValue(RETAINED)
  mocks.accountFindMany.mockResolvedValue([
    { id: 1, code: "400001", name: "Pendapatan", type: "REVENUE" },
    { id: 2, code: "500001", name: "Beban", type: "EXPENSE" },
  ])
  mocks.profitCenterFindMany.mockResolvedValue([{ id: 5, code: "PC-A" }])
  mocks.journalFindFirst.mockResolvedValue(null)
  mocks.journalCreate.mockResolvedValue({ id: 99, journalNumber: "JRN-2026-0001" })
  mocks.journalEntryCreateMany.mockResolvedValue({ count: 3 })
  mocks.journalEntryFindMany.mockResolvedValue([
    entry(1, { credit: 1000 }),
    entry(2, { debit: 400 }),
  ])
})

describe("postYearEndClosing", () => {
  it("E121-1: setting kosong -> ditolak, nol jurnal", async () => {
    mocks.settingsFindFirst.mockResolvedValue({ fiscalYearStartMonth: 1, retainedEarningsAccountId: null })
    await expect(postYearEndClosing(2025, 3)).rejects.toThrow("Akun laba ditahan belum dipetakan di Pengaturan.")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("E121-1b: akun EQTY bukan laba ditahan -> ditolak, nol jurnal", async () => {
    mocks.accountFindFirst.mockResolvedValue({ id: 7, name: "Modal Saham", type: "EQUITY", isActive: true })
    await expect(postYearEndClosing(2025, 3)).rejects.toThrow("bukan akun ekuitas laba ditahan")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("E121-2: posting kedua tahun sama ditolak di dalam tx (bukan P2002 mentah)", async () => {
    mocks.journalFindFirst.mockResolvedValue({ id: 42, journalNumber: "JRN-2025-0099" })
    await expect(postYearEndClosing(2025, 3)).rejects.toThrow("sudah ditutup oleh jurnal JRN-2025-0099")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("E121-4: dua pusat laba + null -> baris lawan laba ditahan terpisah per pusat laba", async () => {
    mocks.journalEntryFindMany.mockResolvedValue([
      entry(1, { credit: 1000, profitCenterId: 5 }),
      entry(1, { credit: 500, profitCenterId: null }),
      entry(2, { debit: 200, profitCenterId: 5 }),
    ])
    const result = await postYearEndClosing(2025, 3)
    expect(result).toMatchObject({ journalId: 99, totalDebit: 1500, totalCredit: 1500 })

    const rows = mocks.journalEntryCreateMany.mock.calls[0][0].data as Array<Record<string, unknown>>
    const retained = rows.filter((r) => r.accountId === 7)
    expect(retained).toHaveLength(2)
    expect(retained).toContainEqual(
      expect.objectContaining({ profitCenterId: 5, credit: 800, debit: 0 }),
    )
    expect(retained).toContainEqual(
      expect.objectContaining({ profitCenterId: null, credit: 500, debit: 0 }),
    )
  })

  it("E121-5: tahun fiskal mulai Juli -> tanggal penutup 30 Jun tahun berikut, bukan 31 Des", async () => {
    mocks.settingsFindFirst.mockResolvedValue({ fiscalYearStartMonth: 7, retainedEarningsAccountId: 7 })
    await postYearEndClosing(2025, 3)
    const created = mocks.journalCreate.mock.calls[0][0].data
    expect((created.transactionDate as Date).toISOString()).toBe("2026-06-30T23:59:59.999Z")
  })

  it("E121-5b: periode terkunci melewati tanggal penutup -> ditolak, nol jurnal", async () => {
    mocks.queryRaw.mockResolvedValue([{ id: 1, period_lock_date: new Date("2026-06-30T00:00:00Z") }])
    await expect(postYearEndClosing(2025, 3)).rejects.toThrow("Periode akuntansi sudah ditutup")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("E121-7: approval pending -> posting ditolak sebelum tx jurnal", async () => {
    mocks.approvalFindFirst.mockResolvedValue({ status: "pending" })
    await expect(postYearEndClosing(2025, 3)).rejects.toThrow("menunggu persetujuan")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("TASK-014: pasangan REVERSED+POSTED neto nol -> tidak ada jurnal penutup sebelah", async () => {
    // Asli REVERSED kredit 1000 + lawan POSTED debit 1000 pada akun pendapatan
    // yang sama harus neto nol. Loader/builder lama hanya POSTED → hanya
    // debit lawan yang dihitung, menghasilkan penutup kredit yatim.
    mocks.journalEntryFindMany.mockResolvedValue([
      { ...entry(1, { credit: 1000 }), journal: { status: "REVERSED" } },
      { ...entry(1, { debit: 1000, credit: 0 }), journal: { status: "POSTED" } },
    ])
    await expect(postYearEndClosing(2025, 3)).rejects.toThrow("Tidak ada saldo akun laba/rugi")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("E121-10: baris jurnal DRAFT tidak ikut saldo posting", async () => {
    // Builder menyaring status; loader meniru query POSTED, jadi DRAFT yang
    // bocor dari pemanggil lain tetap dibuang builder (kredit 999 tak dihitung).
    mocks.journalEntryFindMany.mockResolvedValue([
      entry(1, { credit: 1000 }),
      { ...entry(1, { credit: 999 }), journal: { status: "DRAFT" } },
      entry(2, { debit: 400 }),
    ])
    const result = await postYearEndClosing(2025, 3)
    expect(result).toMatchObject({ totalDebit: 1000, totalCredit: 1000 })
  })

  it("E127-1/E121-8: posting ulang sesudah reversal berhasil — REVERSED tidak memegang kunci aktif", async () => {
    // findFirst anti-dobel hanya POSTED aktif -> REVERSED lama tak terlihat;
    // journal.create kini lolos karena unik aktif (F-127-V) mengabaikan
    // baris REVERSED. Ini titik yang dulu PASTI P2002 journals_reference_unique.
    mocks.journalFindFirst.mockResolvedValue(null)
    const result = await postYearEndClosing(2025, 3)
    expect(result).toMatchObject({ journalId: 99, fiscalYear: 2025 })
    expect(mocks.journalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: "YearEndClosing",
          referenceId: 2025,
          status: "POSTED",
        }),
      }),
    )
  })

  it("E127-2: P2002 unik AKTIF (balapan posting ganda) diterjemahkan pesan-tahun, bukan mentah", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: "journals_active_reference_unique" },
    })
    mocks.journalCreate.mockRejectedValue(p2002)
    await expect(postYearEndClosing(2025, 3)).rejects.toThrow(
      "Tahun fiskal 2025 sudah ditutup oleh jurnal penutup aktif lain",
    )
  })

  it("P2002 bukan unik reference -> diteruskan apa adanya (tidak ditelan)", async () => {
    const lain = Object.assign(new Error("Unique constraint failed on journal_number"), {
      code: "P2002",
      meta: { target: "journals_journal_number_key" },
    })
    mocks.journalCreate.mockRejectedValue(lain)
    await expect(postYearEndClosing(2025, 3)).rejects.toBe(lain)
  })
})

describe("reverseYearEndClosing", () => {
  it("reversal mempertahankan profitCenterId + asli jadi REVERSED", async () => {
    mocks.journalFindFirst.mockResolvedValue({
      id: 42,
      journalNumber: "JRN-2025-0099",
      transactionDate: new Date("2025-12-31T23:59:59.999Z"),
      type: "GENERAL",
      totalDebit: 1000,
      totalCredit: 1000,
      entries: [
        { accountId: 1, debit: 1000, credit: 0, memo: "Penutup", profitCenterId: 5 },
        { accountId: 7, debit: 0, credit: 1000, memo: "Laba ditahan", profitCenterId: 5 },
      ],
    })
    mocks.journalCreate.mockResolvedValue({ id: 100, journalNumber: "JRN-2026-0002" })

    const result = await reverseYearEndClosing(2025, 3)
    expect(result).toMatchObject({ journalId: 42, reversalJournalId: 100 })

    const rows = mocks.journalEntryCreateMany.mock.calls[0][0].data as Array<Record<string, unknown>>
    expect(rows).toContainEqual(expect.objectContaining({ accountId: 1, debit: 0, credit: 1000, profitCenterId: 5 }))
    expect(rows).toContainEqual(expect.objectContaining({ accountId: 7, debit: 1000, credit: 0, profitCenterId: 5 }))
    expect(mocks.journalUpdate).toHaveBeenCalledWith({ where: { id: 42 }, data: { status: "REVERSED" } })
    // Kunci baris + klaim atomik sebelum jurnal lawan dibuat.
    expect(mocks.executeRaw).toHaveBeenCalled()
    expect(mocks.journalUpdateMany).toHaveBeenCalledWith({
      where: { id: 42, status: "POSTED" },
      data: { status: "REVERSING" },
    })
  })

  it("E121-6b: klaim atomik kalah (reversal bersamaan) -> ditolak, nol jurnal lawan", async () => {
    mocks.journalFindFirst.mockResolvedValue({
      id: 42,
      journalNumber: "JRN-2025-0099",
      transactionDate: new Date("2025-12-31T23:59:59.999Z"),
      type: "GENERAL",
      totalDebit: 1000,
      totalCredit: 1000,
      entries: [{ accountId: 1, debit: 1000, credit: 0, memo: "Penutup", profitCenterId: 5 }],
    })
    mocks.journalUpdateMany.mockResolvedValue({ count: 0 })
    await expect(reverseYearEndClosing(2025, 3)).rejects.toThrow("konflik konkurensi")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("tanpa jurnal penutup POSTED -> ditolak berisik", async () => {
    mocks.journalFindFirst.mockResolvedValue(null)
    await expect(reverseYearEndClosing(2025, 3)).rejects.toThrow("tidak ditemukan atau sudah di-reversal")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })
})
