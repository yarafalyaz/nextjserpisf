import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-21-032 loader — yang dijaga:
 * - query faktur hanya status recognised (cancelled/draft tidak muncul, AC-3),
 * - payment diklasifikasi kredit dari paymentMethod "customer_credit",
 *   nomor kredit dipulihkan dari notes (bukan dari allocatedAmount),
 * - pelanggan tak dikenal → statement kosong, bukan error (AC-4 di loader).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    customer: { findFirst: vi.fn() },
    salesInvoice: { findMany: vi.fn() },
    salesPayment: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
    invoiceExchangeItem: { findMany: vi.fn() },
    journal: { findMany: vi.fn() },
    activityLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: mocks.getSystemSettings }))

import { creditDocumentNoFromNotes, loadCustomerStatement } from "../customer-statement-data"

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.customer.findFirst
    .mockResolvedValueOnce({ id: 7, name: "CV Uji" })
    .mockResolvedValueOnce({ phone: "0812-3456-7890", email: "uji@example.com" })
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
  mocks.prismaMock.salesPayment.findMany.mockResolvedValue([])
  mocks.prismaMock.salesReturn.findMany.mockResolvedValue([])
  mocks.prismaMock.invoiceExchangeItem.findMany.mockResolvedValue([])
  mocks.prismaMock.journal.findMany.mockResolvedValue([])
  mocks.prismaMock.activityLog.findMany.mockResolvedValue([])
  mocks.prismaMock.user.findMany.mockResolvedValue([])
  mocks.getSystemSettings.mockResolvedValue({ salesReceivableAccountId: 110 })
})

describe("creditDocumentNoFromNotes", () => {
  it("memulihkan nomor kredit dari notes alokasi service", () => {
    expect(creditDocumentNoFromNotes("Alokasi kredit pelanggan CRD-001 [idem:abcd1234]")).toBe("CRD-001")
    expect(creditDocumentNoFromNotes("Pembayaran biasa")).toBeNull()
    expect(creditDocumentNoFromNotes(null)).toBeNull()
  })
})

describe("loadCustomerStatement", () => {
  it("query faktur memakai status recognised + deletedAt null (cancelled absen)", async () => {
    await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: 7,
          status: { in: ["posted", "partial", "paid"] },
          deletedAt: null,
        }),
      }),
    )
  })

  it("payment customer_credit menjadi baris kredit dengan nomor dokumen kredit", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000 },
    ])
    mocks.prismaMock.salesPayment.findMany.mockResolvedValue([
      {
        id: 13, documentNo: "PAY-013", salesInvoiceId: 2, paymentDate: D("2026-02-12"),
        amount: 150_000, withholdingAmount: 0, paymentMethod: "customer_credit",
        notes: "Alokasi kredit pelanggan CRD-001 [idem:abcd1234]",
        salesInvoice: { documentNo: "INV-002" },
      },
    ])

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    expect(report.customer).toEqual({ id: 7, name: "CV Uji" })
    expect(report.statement.entries).toHaveLength(2)
    const credit = report.statement.entries.find((e) => e.kind === "credit")
    expect(credit).toMatchObject({ documentNo: "PAY-013", credit: 150_000 })
    expect(credit?.description).toContain("CRD-001")
    expect(report.statement.closingBalance).toBe(350_000)
  })

  it("pelanggan tanpa dokumen → saldo 0, baris kosong + notice, bukan error", async () => {
    mocks.prismaMock.customer.findFirst.mockReset()
    mocks.prismaMock.customer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    const report = await loadCustomerStatement(404, { start: D("2026-02-01"), end: D("2026-02-28") })
    expect(report.customer).toBeNull()
    expect(report.customerPhone).toBeNull()
    expect(report.customerEmail).toBeNull()
    expect(report.whatsappTrail).toEqual([])
    expect(report.emailTrail).toEqual([])
    expect(report.statement.openingBalance).toBe(0)
    expect(report.statement.closingBalance).toBe(0)
    expect(report.statement.entries).toEqual([])
    expect(report.table.rows.some((r) => r.kind === "notice")).toBe(true)
  })

  it("F-104-V: retur completed + jurnal POSTED Cr Piutang → baris return; query jurnal hanya POSTED", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000 },
    ])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([
      {
        id: 21, documentNo: "RET-001", salesInvoiceId: 2, date: D("2026-02-15"),
        salesInvoice: { documentNo: "INV-002" },
      },
    ])
    mocks.prismaMock.journal.findMany.mockResolvedValue([
      { referenceId: 21, entries: [{ credit: 100_000 }] },
    ])

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    expect(mocks.prismaMock.salesReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: 7, status: "completed", salesInvoiceId: { not: null } }),
      }),
    )
    expect(mocks.prismaMock.journal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null, status: "POSTED", referenceType: "SalesReturn", referenceId: { in: [21] },
        }),
      }),
    )
    const row = report.statement.entries.find((e) => e.kind === "return")
    expect(row).toMatchObject({ documentNo: "RET-001", credit: 100_000 })
    expect(report.statement.closingBalance).toBe(400_000)
  })

  it("F-104-V: akun Piutang belum terkonfigurasi → returnCredit 0, statement tetap jalan", async () => {
    mocks.getSystemSettings.mockResolvedValue({ salesReceivableAccountId: null })
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000 },
    ])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([
      {
        id: 21, documentNo: "RET-001", salesInvoiceId: 2, date: D("2026-02-15"),
        salesInvoice: { documentNo: "INV-002" },
      },
    ])

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    expect(mocks.prismaMock.journal.findMany).not.toHaveBeenCalled()
    expect(report.statement.entries.some((e) => e.kind === "return")).toBe(false)
    expect(report.statement.closingBalance).toBe(500_000)
  })

  it("F-038-B1: phone pelanggan terpilih dimuat terpisah — payload builder/customer beku", async () => {
    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    expect(report.customer).toEqual({ id: 7, name: "CV Uji" })
    expect(report.customerPhone).toBe("0812-3456-7890")
    expect(mocks.prismaMock.customer.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 7, deletedAt: null },
      select: { id: true, name: true },
    })
    expect(mocks.prismaMock.customer.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 7 },
      select: { phone: true, email: true },
    })
  })

  it("F-038-B1: phone kosong/null → customerPhone null (tombol WA tidak lahir di UI)", async () => {
    mocks.prismaMock.customer.findFirst.mockReset()
    mocks.prismaMock.customer.findFirst
      .mockResolvedValueOnce({ id: 7, name: "CV Uji" })
      .mockResolvedValueOnce({ phone: null })

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })
    expect(report.customerPhone).toBeNull()
  })

  it("F-038-B1: pelanggan statement terhapus lunak → customer null, phone perjalanan tetap, klik ditolak di aksi", async () => {
    mocks.prismaMock.customer.findFirst.mockReset()
    mocks.prismaMock.customer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ phone: "0812-3456-7890" })

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })
    expect(report.customer).toBeNull()
    expect(report.customerPhone).toBe("0812-3456-7890")
  })

  it("F-038-B1: jejak WA statement terbaru-dulu + nama staf dari ActivityLog apa adanya", async () => {
    mocks.prismaMock.activityLog.findMany.mockResolvedValue([
      { userId: 42, createdAt: D("2026-02-20") },
      { userId: 43, createdAt: D("2026-02-18") },
      { userId: null, createdAt: D("2026-02-17") },
    ])
    mocks.prismaMock.user.findMany.mockResolvedValue([
      { id: 42, name: "Sari" },
      { id: 43, name: "Budi" },
    ])

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    expect(mocks.prismaMock.activityLog.findMany).toHaveBeenCalledWith({
      where: { modelType: "CustomerStatement", modelId: 7, action: "whatsapp_link_opened" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { userId: true, createdAt: true },
    })
    expect(mocks.prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: [42, 43] } },
      select: { id: true, name: true },
    })
    expect(report.whatsappTrail).toEqual([
      { userName: "Sari", createdAt: D("2026-02-20") },
      { userName: "Budi", createdAt: D("2026-02-18") },
      { userName: null, createdAt: D("2026-02-17") },
    ])
    // BR-SW-01: loader tidak mengarang status terkirim/dibaca dari jumlah klik.
    expect(JSON.stringify(report.whatsappTrail)).not.toMatch(/terkirim|dibaca/i)
    // Payload builder statement beku (BR-ST-06): saldo tidak berubah oleh jejak.
    expect(report.statement.closingBalance).toBe(0)
  })

  it("F-038-B1: tanpa baris jejak → whatsappTrail [] tanpa query user", async () => {
    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })
    expect(report.whatsappTrail).toEqual([])
    expect(mocks.prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it("F-043-B1: email pelanggan dimuat dari select perluasan yang sama — payload builder/customer beku", async () => {
    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    // Satu query kontak memuat phone+email (bukan query tambahan); identitas
    // pelanggan tetap hanya id+nama (BR-ST-06) dan email lahir terpisah.
    expect([report.customer, report.customerEmail]).toEqual([{ id: 7, name: "CV Uji" }, "uji@example.com"])
    expect(mocks.prismaMock.customer.findFirst.mock.calls).toEqual([
      [{ where: { id: 7, deletedAt: null }, select: { id: true, name: true } }],
      [{ where: { id: 7 }, select: { phone: true, email: true } }],
    ])
  })

  it("F-043-B1: email kosong/null → customerEmail null (tombol email tidak lahir di UI)", async () => {
    mocks.prismaMock.customer.findFirst.mockReset()
    mocks.prismaMock.customer.findFirst
      .mockResolvedValueOnce({ id: 7, name: "CV Uji" })
      .mockResolvedValueOnce({ phone: "0812-3456-7890", email: null })

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })
    expect(report.customerEmail).toBeNull()
    expect(report.customerPhone).toBe("0812-3456-7890")
  })

  it("F-043-B1: jejak email terpisah WA — query email_link_opened + nama staf apa adanya", async () => {
    // findMany dipanggil 2x untuk trail (WA + email); bedakan dari argumen where.
    mocks.prismaMock.activityLog.findMany.mockImplementation(
      async (args: { where: { action: string } }) =>
        args.where.action === "email_link_opened"
          ? [{ userId: 44, createdAt: D("2026-02-21") }]
          : [{ userId: 42, createdAt: D("2026-02-20") }],
    )
    mocks.prismaMock.user.findMany.mockImplementation(
      async (args: { where: { id: { in: number[] } } }) =>
        args.where.id.in.map((id: number) => ({ id, name: id === 44 ? "Rina" : "Sari" })),
    )

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    expect(mocks.prismaMock.activityLog.findMany).toHaveBeenCalledWith({
      where: { modelType: "CustomerStatement", modelId: 7, action: "email_link_opened" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { userId: true, createdAt: true },
    })
    expect(report.emailTrail).toEqual([{ userName: "Rina", createdAt: D("2026-02-21") }])
    expect(report.whatsappTrail).toEqual([{ userName: "Sari", createdAt: D("2026-02-20") }])
    // BR-SE-01/BR-SE-10: tidak ada status terkirim/dibaca; kanal tidak digabung.
    expect(JSON.stringify(report.emailTrail)).not.toMatch(/terkirim|dibaca/i)
    expect(report.statement.closingBalance).toBe(0)
  })

  it("F-043-B1: tanpa baris jejak email → emailTrail [] (query WA tetap terpisah)", async () => {
    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })
    expect(report.emailTrail).toEqual([])
    expect(mocks.prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it("FIN-BR-008: query pembayaran mengecualikan status reversed (histori bukan uang masuk)", async () => {
    await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })
    expect(mocks.prismaMock.salesPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "reversed" } }),
      }),
    )
  })
})

/**
 * F-2026-10-25-025-S loader — AC-ST-B1/B2/B6 di batas DB:
 * select faktur memuat dueDate; query exchangeItem massal (salesInvoice:
 * recognised + deletedAt null, exchange aktif) SATU kali; exchange aktif
 * TERAKHIR per faktur diteruskan sebagai exchangeDueDate; due null DB
 * diteruskan null; tabel PDF memuat kolom Jatuh Tempo + penanda server.
 */
describe("loadCustomerStatement due (F-2026-10-25-025-S)", () => {
  it("AC-ST-B1/B6: dueDate+exchange terakhir diteruskan; query massal satu kali anti-N+1", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000, dueDate: D("2026-02-20") },
      { id: 3, documentNo: "INV-003", date: D("2026-02-06"), grandTotal: 300_000, dueDate: null },
    ])
    mocks.prismaMock.invoiceExchangeItem.findMany.mockResolvedValue([
      // exchange lama — kalah dari yang lebih baru di bawah
      { salesInvoiceId: 2, exchange: { id: 41, date: D("2026-02-08"), dueDate: D("2026-03-01"), deletedAt: null } },
      // exchange aktif terakhir faktur 2
      { salesInvoiceId: 2, exchange: { id: 42, date: D("2026-02-12"), dueDate: D("2026-03-15"), deletedAt: null } },
      // exchange terhapus — diabaikan walau terbaru
      { salesInvoiceId: 2, exchange: { id: 43, date: D("2026-02-18"), dueDate: D("2026-04-01"), deletedAt: D("2026-02-19") } },
    ])

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ dueDate: true }),
      }),
    )
    expect(mocks.prismaMock.invoiceExchangeItem.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.invoiceExchangeItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          salesInvoice: expect.objectContaining({
            customerId: 7,
            status: { in: ["posted", "partial", "paid"] },
            deletedAt: null,
          }),
          exchange: { deletedAt: null },
        }),
      }),
    )

    const inv2 = report.statement.entries.find((e) => e.documentNo === "INV-002")
    // due acuan = exchange terakhir aktif (15 Mar), bukan dueDate faktur (20 Feb)
    expect(inv2?.dueDate).toEqual(D("2026-03-15"))
    expect(inv2?.isOverdue).toBe(false)
    const inv3 = report.statement.entries.find((e) => e.documentNo === "INV-003")
    expect(inv3).toMatchObject({ dueDate: null, isOverdue: false })

    // BR-ST-08: tabel PDF loader memuat kolom + sel due server apa adanya
    expect(report.table.columns.map((c) => c.header)).toContain("Jatuh Tempo")
    const rowInv2 = report.table.rows.find(
      (r) => r.kind === "data" && r.cells.includes("INV-002"),
    )
    expect(rowInv2?.kind === "data" ? rowInv2.cells[2] : undefined).toBe("15 Mar 2026")
    const rowInv3 = report.table.rows.find(
      (r) => r.kind === "data" && r.cells.includes("INV-003"),
    )
    expect(rowInv3?.kind === "data" ? rowInv3.cells[2] : undefined).toBe("—")
  })

  it("AC-ST-B3 via loader: faktur belum lunas due lampau → penanda di keterangan PDF server", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000, dueDate: D("2026-02-20") },
    ])
    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })
    const row = report.statement.entries.find((e) => e.kind === "invoice")
    expect(row?.isOverdue).toBe(true)
    const pdfRow = report.table.rows.find(
      (r) => r.kind === "data" && r.cells.includes("INV-002"),
    )
    expect(pdfRow?.kind === "data" ? pdfRow.cells[3] : "").toContain("Lewat Jatuh Tempo")
  })
})
