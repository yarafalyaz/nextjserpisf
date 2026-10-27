import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

import {
  EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS,
  EXPENSE_DRAFT_CLAIM_LABEL,
  EXPENSE_DRAFT_MENGENDAP_MIN_DAYS,
  EXPENSE_DRAFT_QUEUE_COLUMN_LABELS,
  EXPENSE_DRAFT_QUEUE_LIMIT,
  EXPENSE_DRAFT_QUEUE_TITLE,
  EXPENSE_DRAFT_QUEUE_TOTAL_LABEL,
  buildExpenseDraftQueue,
  type ExpenseDraftInput,
} from "../expense-draft-queue"

const mocks = vi.hoisted(() => ({
  expenseFindMany: vi.fn(),
  approvalFindMany: vi.fn(),
  projectFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    expense: { findMany: (...a: unknown[]) => mocks.expenseFindMany(...a) },
    approval: { findMany: (...a: unknown[]) => mocks.approvalFindMany(...a) },
    project: { findMany: (...a: unknown[]) => mocks.projectFindMany(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getExpenseDraftQueue } from "../expense-draft-queue-data"

// 27 Okt 2026 09:00 WIB (= 02:00 UTC); hari kalender WIB stabil.
const NOW = new Date(Date.UTC(2026, 9, 27, 2, 0, 0))
const day = (offset: number) => new Date(Date.UTC(2026, 9, 27 + offset, 2, 0, 0))

function input(overrides: Partial<ExpenseDraftInput> = {}): ExpenseDraftInput {
  return {
    expenseId: 1,
    slug: "exp-0001",
    documentNo: "EXP-0001",
    status: "draft",
    amount: 1_000_000,
    date: day(-1),
    createdAt: day(-1),
    updatedAt: day(-1),
    isReimbursementClaim: false,
    employeeId: null,
    employeeName: null,
    categoryName: "Operasional",
    vendorName: null,
    projectName: null,
    description: "Biaya uji",
    approvals: [],
    ...overrides,
  }
}

describe("expense-draft-queue (F-2026-10-27-107-S)", () => {
  it("kata verbatim Q-EXQ-1/2/4 + ambang bernama", () => {
    expect(EXPENSE_DRAFT_QUEUE_TITLE).toBe("Pengeluaran Menunggu Persetujuan")
    expect(EXPENSE_DRAFT_QUEUE_COLUMN_LABELS.umurMenunggu).toBe("Umur Menunggu")
    expect(EXPENSE_DRAFT_QUEUE_COLUMN_LABELS.keadaanPersetujuan).toBe(
      "Keadaan Persetujuan",
    )
    expect(EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS.tanpa_workflow).toBe("tanpa workflow")
    expect(EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS.menunggu_langkah).toBe(
      "menunggu langkah",
    )
    expect(
      EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS.workflow_selesai_menunggu_sinkron,
    ).toBe("workflow selesai — menunggu sinkron")
    expect(EXPENSE_DRAFT_MENGENDAP_MIN_DAYS).toBe(3)
    expect(EXPENSE_DRAFT_QUEUE_TOTAL_LABEL).toBe(
      "total nominal tersimpan baris tampil — bukan saldo buku",
    )
    expect(EXPENSE_DRAFT_CLAIM_LABEL).toBe("Klaim Karyawan")
    expect(EXPENSE_DRAFT_QUEUE_LIMIT).toBeGreaterThan(0)
  })

  it("AC-EXQ-B1: hanya draft; approved/paid/rejected bocor walau Approval pending = merah", () => {
    const pending = [{ approvalId: 1, status: "pending", createdAt: day(-1) }]
    const queue = buildExpenseDraftQueue(
      [
        input({ expenseId: 1, documentNo: "EXP-DRAFT" }),
        input({ expenseId: 2, documentNo: "EXP-APPROVED", status: "approved", approvals: pending }),
        input({ expenseId: 3, documentNo: "EXP-PAID", status: "paid", approvals: pending }),
        input({ expenseId: 4, documentNo: "EXP-REJECTED", status: "rejected", approvals: pending }),
        input({ expenseId: 5, documentNo: "EXP-ASING", status: "Draft", approvals: pending }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.documentNo)).toEqual(["EXP-DRAFT"])
    expect(queue.totalPopulation).toBe(1)
  })

  it("AC-EXQ-B2: umur WIB dari createdAt; date lampau + createdAt hari ini = 0; updatedAt tidak dibaca", () => {
    const queue = buildExpenseDraftQueue(
      [
        input({
          expenseId: 1,
          documentNo: "EXP-BARU",
          date: day(-365),
          createdAt: day(0),
          updatedAt: day(-300),
        }),
        input({
          expenseId: 2,
          documentNo: "EXP-LAMA",
          date: day(0),
          createdAt: day(-10),
          updatedAt: day(0),
        }),
      ],
      NOW,
    )
    const byDoc = new Map(queue.rows.map((r) => [r.documentNo, r]))
    expect(byDoc.get("EXP-BARU")?.umurMenungguHari).toBe(0)
    expect(byDoc.get("EXP-BARU")?.tingkat).toBe("menunggu")
    expect(byDoc.get("EXP-LAMA")?.umurMenungguHari).toBe(10)
    expect(byDoc.get("EXP-LAMA")?.tingkat).toBe("mengendap")
  })

  it("AC-EXQ-B2: batas Mengendap tepat 3 hari; 2 hari masih Menunggu", () => {
    const queue = buildExpenseDraftQueue(
      [
        input({ expenseId: 1, documentNo: "EXP-2", createdAt: day(-2) }),
        input({ expenseId: 2, documentNo: "EXP-3", createdAt: day(-3) }),
      ],
      NOW,
    )
    const byDoc = new Map(queue.rows.map((r) => [r.documentNo, r]))
    expect(byDoc.get("EXP-2")?.tingkat).toBe("menunggu")
    expect(byDoc.get("EXP-3")?.tingkat).toBe("mengendap")
    expect(byDoc.get("EXP-3")?.tingkatLabel).toBe("Mengendap")
  })

  it("AC-EXQ-B3/EC-EXQ-5: Approval TERBARU menentukan ember; riwayat lama tidak mencemari", () => {
    const queue = buildExpenseDraftQueue(
      [
        input({
          expenseId: 1,
          documentNo: "EXP-SINKRON",
          approvals: [
            { approvalId: 10, status: "pending", createdAt: day(-5) },
            { approvalId: 11, status: "approved", createdAt: day(-1) },
          ],
        }),
        input({
          expenseId: 2,
          documentNo: "EXP-ULANG",
          approvals: [
            { approvalId: 20, status: "approved", createdAt: day(-5) },
            { approvalId: 21, status: "pending", createdAt: day(-1) },
          ],
        }),
        // Seri createdAt sama -> id terbesar yang terbaru.
        input({
          expenseId: 3,
          documentNo: "EXP-SERI",
          approvals: [
            { approvalId: 31, status: "rejected", createdAt: day(-1) },
            { approvalId: 30, status: "pending", createdAt: day(-1) },
          ],
        }),
      ],
      NOW,
    )
    const byDoc = new Map(queue.rows.map((r) => [r.documentNo, r]))
    expect(byDoc.get("EXP-SINKRON")?.keadaanPendamping).toBe(
      "workflow_selesai_menunggu_sinkron",
    )
    expect(byDoc.get("EXP-SINKRON")?.latestApprovalId).toBe(11)
    expect(byDoc.get("EXP-ULANG")?.keadaanPendamping).toBe("menunggu_langkah")
    expect(byDoc.get("EXP-SERI")?.keadaanPendamping).toBe("workflow_ditolak")
  })

  it("AC-EXQ-B3: tanpa Approval masuk ember tanpa workflow, bukan hilang; rejected terpisah", () => {
    const queue = buildExpenseDraftQueue(
      [
        input({ expenseId: 1, documentNo: "EXP-TANPA", approvals: [] }),
        input({
          expenseId: 2,
          documentNo: "EXP-TOLAK",
          approvals: [{ approvalId: 1, status: "rejected", createdAt: day(-1) }],
        }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(2)
    expect(queue.bucketRecap.tanpa_workflow.count).toBe(1)
    expect(queue.bucketRecap.workflow_ditolak.count).toBe(1)
    expect(
      queue.rows.find((r) => r.documentNo === "EXP-TANPA")?.keadaanPendampingLabel,
    ).toBe("tanpa workflow")
    expect(
      queue.rows.find((r) => r.documentNo === "EXP-TANPA")?.latestApprovalStatus,
    ).toBeNull()
  })

  it("EC-EXQ-6: status Approval asing masuk ember keadaan tidak dikenal; label ember verbatim", () => {
    const queue = buildExpenseDraftQueue(
      [
        input({
          expenseId: 1,
          documentNo: "EXP-ASING-APPROVAL",
          approvals: [{ approvalId: 1, status: "cancelled", createdAt: day(-1) }],
        }),
        input({
          expenseId: 2,
          documentNo: "EXP-EJAAN-ASING",
          approvals: [{ approvalId: 2, status: "Approved", createdAt: day(-1) }],
        }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(2)
    expect(queue.bucketRecap.keadaan_tidak_dikenal.count).toBe(2)
    for (const row of queue.rows) {
      expect(row.keadaanPendamping).toBe("keadaan_tidak_dikenal")
      expect(row.keadaanPendampingLabel).toBe("keadaan tidak dikenal")
    }
    expect(queue.rows[0].latestApprovalStatus).toBe("cancelled")
    expect(EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS.workflow_ditolak).toBe(
      "workflow ditolak",
    )
    expect(EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS.keadaan_tidak_dikenal).toBe(
      "keadaan tidak dikenal",
    )
  })

  it("AC-EXQ-B4: total berlabel persis; payload tanpa field/label terlarang dan tanpa bukti/kontak", () => {
    const queue = buildExpenseDraftQueue([input()], NOW)
    expect(queue.totalLabel).toBe(
      "total nominal tersimpan baris tampil — bukan saldo buku",
    )
    expect(queue.totalNominalBarisTampil).toBe(1_000_000)
    const rowKeys = Object.keys(queue.rows[0])
    const queueKeys = Object.keys(queue)
    for (const key of [...rowKeys, ...queueKeys]) {
      expect(key).not.toMatch(/payable|aging|utang|saldo/i)
    }
    expect(rowKeys).not.toContain("receiptImage")
    expect(rowKeys).not.toContain("referenceNo")
    expect(JSON.stringify(queue.rows[0])).not.toMatch(/receiptImage|referenceNo/)
  })

  it("BR-EXQ-06/EC-EXQ-3: penanda klaim + nama pengaju; non-klaim tanpa penanda walau employeeId null", () => {
    const queue = buildExpenseDraftQueue(
      [
        input({
          expenseId: 1,
          documentNo: "EXP-KLAIM",
          isReimbursementClaim: true,
          employeeId: 7,
          employeeName: "Budi Pengaju",
        }),
        input({ expenseId: 2, documentNo: "EXP-OPS", isReimbursementClaim: false }),
      ],
      NOW,
    )
    const claim = queue.rows.find((r) => r.documentNo === "EXP-KLAIM")
    const ops = queue.rows.find((r) => r.documentNo === "EXP-OPS")
    expect(claim?.claimLabel).toBe("Klaim Karyawan")
    expect(claim?.employeeName).toBe("Budi Pengaju")
    expect(ops?.claimLabel).toBeNull()
    // Baris klaim milik siapa pun tetap tampil (BR-EXQ-08: tidak disembunyikan).
    expect(queue.rows).toHaveLength(2)
  })

  it("BR-EXQ-10: urutan mengendap -> tertua -> id naik; rekap penuh walau tampil terpotong", () => {
    const inputs = [
      input({ expenseId: 5, documentNo: "EXP-BARU", createdAt: day(0), amount: 50_000 }),
      input({ expenseId: 3, documentNo: "EXP-TUA-B", createdAt: day(-10), amount: 100_000 }),
      input({ expenseId: 2, documentNo: "EXP-TUA-A", createdAt: day(-10), amount: 100_000 }),
      input({ expenseId: 4, documentNo: "EXP-SEDANG", createdAt: day(-5), amount: 100_000 }),
      input({ expenseId: 6, documentNo: "EXP-MUDA", createdAt: day(-1), amount: 100_000 }),
    ]
    const queue = buildExpenseDraftQueue(inputs, NOW, 2)
    expect(queue.rows.map((r) => r.documentNo)).toEqual(["EXP-TUA-A", "EXP-TUA-B"])
    expect(queue.terpotong).toBe(true)
    expect(queue.totalPopulation).toBe(5)
    expect(queue.levelCounts).toEqual({ mengendap: 3, menunggu: 2 })
    expect(queue.bucketRecap.tanpa_workflow.count).toBe(5)
    expect(queue.bucketRecap.tanpa_workflow.totalAmount).toBe(450_000)
    // Total berlabel dihitung dari baris TAMPIL sesuai katanya.
    expect(queue.totalNominalBarisTampil).toBe(200_000)
    expect(queue.displayedCount).toBe(2)

    const full = buildExpenseDraftQueue(inputs, NOW)
    expect(full.rows.map((r) => r.documentNo)).toEqual([
      "EXP-TUA-A",
      "EXP-TUA-B",
      "EXP-SEDANG",
      "EXP-MUDA",
      "EXP-BARU",
    ])
  })
})

describe("getExpenseDraftQueue (loader fail-closed, AC-EXQ-B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.expenseFindMany.mockResolvedValue([])
    mocks.approvalFindMany.mockResolvedValue([])
    mocks.projectFindMany.mockResolvedValue([])
  })

  it("tanpa izin menolak SEBELUM query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getExpenseDraftQueue({ now: NOW })).rejects.toThrow(
      "Tidak memiliki izin",
    )
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_expenses")
    expect(mocks.expenseFindMany).not.toHaveBeenCalled()
    expect(mocks.approvalFindMany).not.toHaveBeenCalled()
  })

  it("satu query Approval massal per halaman (anti-N+1) + proyek massal; Approval lama tidak mencemari", async () => {
    mocks.expenseFindMany.mockResolvedValue([
      {
        id: 1, slug: "exp-1", documentNo: "EXP-1", status: "draft",
        amount: 500000, date: day(-90), createdAt: day(-4), updatedAt: day(0),
        isReimbursementClaim: true, employeeId: 7, categoryId: 1, vendorId: null,
        projectId: 9, description: "Klaim bensin",
        category: { label: "Transport" }, vendor: null, employee: { name: "Budi" },
      },
      {
        id: 2, slug: "exp-2", documentNo: "EXP-2", status: "draft",
        amount: 250000, date: day(0), createdAt: day(0), updatedAt: day(0),
        isReimbursementClaim: false, employeeId: null, categoryId: null,
        vendorId: 3, projectId: null, description: null,
        category: null, vendor: { name: "PT Vendor" }, employee: null,
      },
    ])
    mocks.approvalFindMany.mockResolvedValue([
      { id: 10, referenceId: 1, status: "pending", createdAt: day(-4) },
      { id: 11, referenceId: 1, status: "approved", createdAt: day(-1) },
    ])
    mocks.projectFindMany.mockResolvedValue([{ id: 9, name: "Proyek Alpha" }])

    const queue = await getExpenseDraftQueue({ now: NOW })

    expect(mocks.expenseFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.expenseFindMany.mock.calls[0][0].where).toEqual({ status: "draft" })
    // Select daftar-putih: bukti/kontak tidak dibaca loader.
    expect(mocks.expenseFindMany.mock.calls[0][0].select).not.toHaveProperty("receiptImage")
    expect(mocks.expenseFindMany.mock.calls[0][0].select).not.toHaveProperty("referenceNo")
    expect(mocks.approvalFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.approvalFindMany.mock.calls[0][0].where).toEqual({
      referenceType: "Expense",
      referenceId: { in: [1, 2] },
    })
    expect(mocks.projectFindMany).toHaveBeenCalledTimes(1)

    expect(queue.rows).toHaveLength(2)
    const claim = queue.rows.find((r) => r.documentNo === "EXP-1")
    expect(claim?.keadaanPendamping).toBe("workflow_selesai_menunggu_sinkron")
    expect(claim?.claimLabel).toBe("Klaim Karyawan")
    expect(claim?.employeeName).toBe("Budi")
    expect(claim?.projectName).toBe("Proyek Alpha")
    expect(claim?.umurMenungguHari).toBe(4)
    const ops = queue.rows.find((r) => r.documentNo === "EXP-2")
    expect(ops?.keadaanPendamping).toBe("tanpa_workflow")
    expect(ops?.umurMenungguHari).toBe(0)
  })

  it("tanpa draft: Approval dan Project tidak ditanyakan sama sekali", async () => {
    const queue = await getExpenseDraftQueue({ now: NOW })
    expect(queue.rows).toEqual([])
    expect(mocks.approvalFindMany).not.toHaveBeenCalled()
    expect(mocks.projectFindMany).not.toHaveBeenCalled()
  })
})

describe("wiring permukaan antrean pengeluaran (AC-EXQ-F1..F3, BR-EXQ-07)", () => {
  const root = process.cwd()
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8")
  const builderSource = read("src/lib/reports/expense-draft-queue.ts")
  const loaderSource = read("src/lib/reports/expense-draft-queue-data.ts")
  const uiSource = read(
    "src/app/(dashboard)/keuangan/pengeluaran/_components/expense-draft-queue.tsx",
  )
  const pageSource = read("src/app/(dashboard)/keuangan/pengeluaran/page.tsx")

  it("AC-EXQ-B5/F2: builder+loader baca-saja — tanpa panggilan aksi tulis pengeluaran", () => {
    expect(builderSource + loaderSource).not.toMatch(
      /approveExpense|rejectExpense|deleteExpense|payExpense/,
    )
    expect(loaderSource).not.toMatch(/\.update\(|\.create\(|\.delete\(|updateMany/)
    expect(loaderSource).toContain('requirePermission("view_expenses")')
    expect(loaderSource).toContain('where: { status: "draft" }')
  })

  it("AC-EXQ-B4: nominal tidak dilabeli istilah terlarang pada builder/loader/UI", () => {
    const surfaces = builderSource + loaderSource + uiSource
    expect(surfaces).not.toMatch(/utang|aging|payable/i)
    expect(builderSource).toContain(
      '"total nominal tersimpan baris tampil — bukan saldo buku"',
    )
  })

  it("AC-EXQ-F1: UI verbatim payload — tanpa hitung umur/tingkat/ember/rekap sendiri", () => {
    expect(uiSource).not.toMatch(/\.sort\(|wibDayNumber|getTime\(\)|86400|86_400/)
    expect(uiSource).toContain("EXPENSE_DRAFT_QUEUE_TITLE")
    expect(uiSource).toContain("row.umurMenungguLabel")
    expect(uiSource).toContain("row.tingkatLabel")
    expect(uiSource).toContain("row.keadaanPendampingLabel")
    expect(uiSource).toContain("queue.bucketRecap")
    expect(uiSource).toContain("queue.totalLabel")
    expect(uiSource).toContain("queue.totalNominalBarisTampil")
  })

  it("AC-EXQ-F2: tanpa tombol tulis dari antrean; tautan hanya ke detail pengeluaran existing", () => {
    expect(uiSource).not.toMatch(/<button|onClick=|onPress=/)
    expect(uiSource).not.toMatch(
      /approveExpense|rejectExpense|deleteExpense|Setujui|Tolak|Hapus|Bayar/,
    )
    expect(uiSource).toContain('entityHref("/keuangan/pengeluaran"')
    expect(uiSource).not.toMatch(/href="\/keuangan\/(?!pengeluaran)/)
  })

  it("AC-EXQ-F3: ember workflow selesai tampil terpisah terhitung; daftar existing tidak berubah", () => {
    expect(uiSource).toContain("EXPENSE_DRAFT_APPROVAL_BUCKETS")
    expect(uiSource).toContain("EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS")
    expect(builderSource).toContain("workflow selesai — menunggu sinkron")
    expect(uiSource).toContain("EXPENSE_DRAFT_QUEUE_TRUNCATED_LABEL")
    expect(pageSource).toContain("getExpenseDraftQueue")
    expect(pageSource).toContain("ExpenseDraftQueueSection")
    expect(pageSource).toContain("ExpenseTable")
    expect(pageSource).toContain("perPage = 100")
  })
})
