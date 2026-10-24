import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-24-133-V Putusan 1-5 (jalur L3 biaya telat non-job):
 * penanda baku, WO wajib closed, penjaga tipe akun Expense,
 * guard duplikat vendor+nominal+tanggal per WO.
 */

const mocks = vi.hoisted(() => ({
  workOrderFindUnique: vi.fn(),
  accountFindUnique: vi.fn(),
  settingFindFirst: vi.fn(),
  activityLogFindMany: vi.fn(),
  activityLogCreate: vi.fn(),
  vendorBillFindUnique: vi.fn(),
  expenseFindUnique: vi.fn(),
  journalFindFirst: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {},
}))

import {
  L3_MARKER,
  parseL3Tag,
  formatL3Tag,
  resolveL3WorkOrder,
  assertExpenseL3AccountAllowed,
  assertNoDuplicateL3,
  writeL3ActivityLog,
} from "../late-cost-l3.service"

function makeClient() {
  return {
    workOrder: { findUnique: mocks.workOrderFindUnique },
    account: { findUnique: mocks.accountFindUnique },
    systemSetting: { findFirst: mocks.settingFindFirst },
    activityLog: { findMany: mocks.activityLogFindMany, create: mocks.activityLogCreate },
    vendorBill: { findUnique: mocks.vendorBillFindUnique },
    expense: { findUnique: mocks.expenseFindUnique },
    journal: { findFirst: mocks.journalFindFirst },
  } as any
}

const WO = { id: 7, documentNo: "WO-0007", status: "closed" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.workOrderFindUnique.mockResolvedValue(WO)
  mocks.activityLogFindMany.mockResolvedValue([])
  mocks.activityLogCreate.mockResolvedValue({})
  mocks.settingFindFirst.mockResolvedValue({
    wipAccountId: 900,
    materialExpenseAccountId: 901,
    cogsAccountId: 902,
    materialIssueExpenseAccountId: 903,
  })
  mocks.journalFindFirst.mockResolvedValue(null)
})

describe("parseL3Tag / formatL3Tag", () => {
  it("frasa tunggal baku round-trip", () => {
    const text = formatL3Tag("WO-0007", "jasa bubut telat, ditanggung perusahaan")
    expect(text.startsWith(L3_MARKER)).toBe(true)
    expect(parseL3Tag(text)).toEqual({
      workOrderNo: "WO-0007",
      reason: "jasa bubut telat, ditanggung perusahaan",
    })
  })

  it("tanpa penanda -> null (perilaku non-L3 utuh)", () => {
    expect(parseL3Tag("catatan biasa")).toBeNull()
    expect(parseL3Tag(null)).toBeNull()
    expect(parseL3Tag("BIAYA TELAT NON-JOB tanpa format")).toBeNull()
  })

  it("penanda tanpa alasan -> reason kosong tertangkap guard", async () => {
    await expect(
      resolveL3WorkOrder(makeClient(), `${L3_MARKER} | WO: WO-0007 | Alasan:  `, "Tagihan"),
    ).rejects.toThrow(/alasan/i)
  })
})

describe("resolveL3WorkOrder", () => {
  it("WO closed lolos", async () => {
    const r = await resolveL3WorkOrder(makeClient(), formatL3Tag("WO-0007", "alasan sah"), "Tagihan")
    expect(r?.workOrder.id).toBe(7)
  })

  it("WO belum closed ditolak (bukan jalur L3)", async () => {
    mocks.workOrderFindUnique.mockResolvedValue({ ...WO, status: "completed" })
    await expect(
      resolveL3WorkOrder(makeClient(), formatL3Tag("WO-0007", "alasan sah"), "Tagihan"),
    ).rejects.toThrow(/belum ditutup|bukan closed/)
  })

  it("WO tidak ditemukan ditolak", async () => {
    mocks.workOrderFindUnique.mockResolvedValue(null)
    await expect(
      resolveL3WorkOrder(makeClient(), formatL3Tag("WO-9999", "alasan sah"), "Tagihan"),
    ).rejects.toThrow(/tidak ditemukan/)
  })
})

describe("assertExpenseL3AccountAllowed", () => {
  it("akun EXPS aktif lolos", async () => {
    mocks.accountFindUnique.mockResolvedValue({ code: "600020", reportGroup: "EXPS", isActive: true })
    await expect(assertExpenseL3AccountAllowed(makeClient(), 620)).resolves.toBeUndefined()
  })

  it("akun COGS ditolak menyebut tipe", async () => {
    mocks.accountFindUnique.mockResolvedValue({ code: "510102", reportGroup: "COGS", isActive: true })
    await expect(assertExpenseL3AccountAllowed(makeClient(), 510)).rejects.toThrow(/COGS/)
  })

  it("akun INTR (WIP/persediaan) ditolak menyebut tipe", async () => {
    mocks.accountFindUnique.mockResolvedValue({ code: "110404", reportGroup: "INTR", isActive: true })
    await expect(assertExpenseL3AccountAllowed(makeClient(), 110)).rejects.toThrow(/INTR/)
  })

  it("akun id = wipAccountId setting ditolak walau grup EXPS", async () => {
    mocks.accountFindUnique.mockResolvedValue({ code: "699999", reportGroup: "EXPS", isActive: true })
    await expect(assertExpenseL3AccountAllowed(makeClient(), 900)).rejects.toThrow(/WIP/)
  })
})

describe("assertNoDuplicateL3", () => {
  const input = {
    workOrderId: 7,
    workOrderNo: "WO-0007",
    vendorKey: "vendor:3",
    amount: 150000,
    date: new Date("2026-10-24T00:00:00.000Z"),
  }

  function logWith(sourceStatus: string) {
    mocks.activityLogFindMany.mockResolvedValue([
      {
        metadata: JSON.stringify({
          sourceType: "VendorBill",
          sourceId: 11,
          vendorKey: "vendor:3",
          amount: 150000,
          date: "2026-10-24",
        }),
      },
    ])
    mocks.vendorBillFindUnique.mockResolvedValue({ status: sourceStatus, deletedAt: null })
  }

  it("duplikat aktif ditolak", async () => {
    logWith("posted")
    await expect(assertNoDuplicateL3(makeClient(), input)).rejects.toThrow(/satu kali/)
  })

  it("dokumen pertama cancelled -> pengganti boleh", async () => {
    logWith("cancelled")
    await expect(assertNoDuplicateL3(makeClient(), input)).resolves.toBeUndefined()
  })

  it("jurnal pertama REVERSED -> pengganti boleh", async () => {
    logWith("posted")
    mocks.journalFindFirst.mockResolvedValue({ status: "REVERSED" })
    await expect(assertNoDuplicateL3(makeClient(), input)).resolves.toBeUndefined()
  })

  it("nominal beda bukan duplikat", async () => {
    logWith("posted")
    await expect(
      assertNoDuplicateL3(makeClient(), { ...input, amount: 200000 }),
    ).resolves.toBeUndefined()
  })

  it("dokumen yang sama (excludeSource) bukan duplikat dirinya", async () => {
    logWith("posted")
    await expect(
      assertNoDuplicateL3(makeClient(), {
        ...input,
        excludeSource: { sourceType: "VendorBill", sourceId: 11 },
      }),
    ).resolves.toBeUndefined()
  })
})

describe("writeL3ActivityLog", () => {
  it("menulis jejak WO lengkap (dokumen, nominal, alasan)", async () => {
    await writeL3ActivityLog(makeClient(), {
      workOrder: WO,
      sourceType: "VendorBill",
      sourceId: 11,
      sourceDocumentNo: "BILL-0011",
      vendorKey: "vendor:3",
      amount: 150000,
      date: new Date("2026-10-24T00:00:00.000Z"),
      reason: "jasa bubut telat",
      userId: 42,
    })
    const arg = mocks.activityLogCreate.mock.calls[0][0]
    expect(arg.data.modelType).toBe("WorkOrder")
    expect(arg.data.modelId).toBe(7)
    expect(arg.data.description).toContain("BILL-0011")
    expect(arg.data.description).toContain("jasa bubut telat")
    const meta = JSON.parse(arg.data.metadata)
    expect(meta).toMatchObject({ sourceType: "VendorBill", sourceId: 11, amount: 150000, date: "2026-10-24" })
  })
})
