import { describe, expect, it } from "vitest"

import {
  PROJECT_BUDGET_CATEGORIES,
  buildProjectBudget,
  buildProjectBudgetHistory,
  evaluateBudgetLock,
  type ProjectBudgetInput,
  type ProjectBudgetItemInput,
} from "@/lib/reports/project-budget"
import type { ProjectPlResult } from "@/lib/reports/project-pl"

function pl(over: Partial<ProjectPlResult> = {}): ProjectPlResult {
  return {
    projectId: 1,
    revenue: 50_000_000,
    materialCost: 4_000_000,
    productionCost: 5_000_000,
    expenseCost: 1_000_000,
    pettyCashCost: 0,
    vendorBillCost: 0,
    totalCost: 10_000_000,
    profit: 40_000_000,
    marginPercent: 80,
    revenueInvoiceIds: [1],
    materialIssueIds: [1],
    vendorBillIds: [],
    unpulledTimesheetHours: 7.5,
    unpulledTimesheetCount: 2,
    ...over,
  }
}

const STAGES = [
  { id: 11, name: "Persiapan", sortOrder: 1 },
  { id: 12, name: "Pengerjaan", sortOrder: 2 },
]

function item(over: Partial<ProjectBudgetItemInput> = {}): ProjectBudgetItemInput {
  return {
    id: 1,
    projectStageId: 11,
    category: "material",
    qty: 1,
    cost: 1_000_000,
    sortOrder: 0,
    ...over,
  }
}

function base(over: Partial<ProjectBudgetInput> = {}): ProjectBudgetInput {
  return {
    projectId: 1,
    contractAmount: 60_000_000,
    contractSource: "quotation",
    budgetLockedAt: null,
    budgetRevisionNo: 0,
    items: [],
    stages: STAGES,
    pl: pl(),
    ...over,
  }
}

describe("buildProjectBudget — F-2026-10-21-030 fase b", () => {
  it("kategori kanonik persis material|labor|subkontrak|lain", () => {
    expect(PROJECT_BUDGET_CATEGORIES).toEqual(["material", "labor", "subkontrak", "lain"])
  })

  it("agregasi per (tahap, kategori) + ember belum-teralokasi; rekonsiliasi Σ = ΣRAB", () => {
    const r = buildProjectBudget(
      base({
        items: [
          item({ id: 1, projectStageId: 11, category: "material", qty: 2, cost: 1_000_000 }),
          item({ id: 2, projectStageId: 11, category: "labor", qty: 1, cost: 3_000_000 }),
          item({ id: 3, projectStageId: 12, category: "material", qty: 4, cost: 500_000 }),
          item({ id: 4, projectStageId: null, category: "lain", qty: 1, cost: 750_000 }),
          item({ id: 5, projectStageId: null, category: null, qty: 1, cost: 250_000 }),
        ],
      }),
    )
    expect(r.perStageBudget).toHaveLength(2)
    expect(r.perStageBudget[0]).toMatchObject({ projectStageId: 11, stageName: "Persiapan", total: 5_000_000 })
    expect(r.perStageBudget[0].categories).toEqual([
      { category: "material", amount: 2_000_000 },
      { category: "labor", amount: 3_000_000 },
    ])
    expect(r.perStageBudget[1]).toMatchObject({ projectStageId: 12, total: 2_000_000 })
    expect(r.unallocatedBudget.total).toBe(1_000_000)
    const stageSum = r.perStageBudget.reduce((s, x) => s + x.total, 0)
    expect(stageSum + r.unallocatedBudget.total).toBe(r.totalBudget)
    expect(r.totalBudget).toBe(8_000_000)
  })

  it("A1 falsifikasi: cabut satu baris -> total turun tepat nilai baris itu", () => {
    const items = [
      item({ id: 1, qty: 2, cost: 1_000_000 }), // 2.000.000
      item({ id: 2, projectStageId: 12, category: "labor", qty: 3, cost: 400_000 }), // 1.200.000
    ]
    const withAll = buildProjectBudget(base({ items }))
    const withoutSecond = buildProjectBudget(base({ items: [items[0]] }))
    expect(withAll.totalBudget - withoutSecond.totalBudget).toBe(1_200_000)
  })

  it("A2 realisasi = totalCost F-029 persis; belum-teralokasi = totalCost penuh (BR-09 ditunda)", () => {
    const r = buildProjectBudget(base({ items: [item({})] }))
    expect(r.realizedTotal).toBe(10_000_000)
    expect(r.unallocatedRealized).toBe(10_000_000)
    expect(r.realizedTotal - r.unallocatedRealized).toBe(0)
    expect(r.varianceTotal).toBe(1_000_000 - 10_000_000)
    expect(r.revenue).toBe(50_000_000)
  })

  it("marginRencana = contractAmount - totalBudget; null bila kontrak belum ada", () => {
    const r = buildProjectBudget(base({ items: [item({ qty: 8, cost: 1_000_000 })] }))
    expect(r.marginRencana).toBe(52_000_000)
    const noContract = buildProjectBudget(
      base({ contractAmount: null, contractSource: null, items: [item({})] }),
    )
    expect(noContract.marginRencana).toBeNull()
    expect(noContract.contractSource).toBeNull()
  })

  it("sumber manual berlabel manual; terkunci terbaca isLocked", () => {
    const r = buildProjectBudget(
      base({ contractSource: "manual", budgetLockedAt: new Date(), budgetRevisionNo: 3 }),
    )
    expect(r.contractSource).toBe("manual")
    expect(r.isLocked).toBe(true)
    expect(r.budgetRevisionNo).toBe(3)
  })

  it("sen-aman: qty x cost desimal tanpa drift float", () => {
    const r = buildProjectBudget(
      base({ items: [item({ qty: 3, cost: 333_333.33 })] }),
    )
    expect(r.totalBudget).toBe(999_999.99)
  })

  it("tahap tak dikenal (id tanpa master stage): stageName null, tetap terhitung", () => {
    const r = buildProjectBudget(base({ items: [item({ projectStageId: 99 })] }))
    expect(r.perStageBudget[0].stageName).toBeNull()
    expect(r.totalBudget).toBe(1_000_000)
  })
})

describe("evaluateBudgetLock — BR-02/BR-13 (A3)", () => {
  const okProject = { contractAmount: 10_000_000, budgetLockedAt: null, projectStatus: "in_progress" }
  const okItems = [item({})]

  it("lolos bila semua prasyarat terpenuhi", () => {
    expect(evaluateBudgetLock(okProject, okItems, STAGES)).toEqual([])
  })

  it("tolak: kontrak kosong, baris yatim, kategori tak sah, total 0 — pesan menyebut prasyarat", () => {
    const failures = evaluateBudgetLock(
      { contractAmount: null, budgetLockedAt: null, projectStatus: "active" },
      [item({ projectStageId: null, category: "aneh", qty: 1, cost: 0 })],
      STAGES,
    )
    expect(failures.join(" ")).toContain("contractAmount")
    expect(failures.join(" ")).toContain("tanpa tahap")
    expect(failures.join(" ")).toContain("kategori kanonik")
    expect(failures.join(" ")).toContain("Total RAB")
  })

  it("tolak: tanpa baris RAB sama sekali", () => {
    expect(evaluateBudgetLock(okProject, [], STAGES).join(" ")).toContain("Belum ada baris RAB")
  })

  it("tolak: sudah terkunci (kunci kedua) + proyek completed (BR-13)", () => {
    expect(
      evaluateBudgetLock({ ...okProject, budgetLockedAt: new Date() }, okItems, STAGES).join(" "),
    ).toContain("sudah terkunci")
    expect(
      evaluateBudgetLock({ ...okProject, projectStatus: "completed" }, okItems, STAGES).join(" "),
    ).toContain("completed")
  })

  it("tolak: tahap menunjuk proyek lain (id tak ada di daftar tahap proyek)", () => {
    const failures = evaluateBudgetLock(okProject, [item({ projectStageId: 77 })], STAGES)
    expect(failures.join(" ")).toContain("tanpa tahap")
  })

  it("FALSIFIKASI penjaga: baris sah yang dilonggarkan manual harusnya gagal bila qty 0", () => {
    // Mengunci perilaku penjaga: qty 0 bukan baris sah walau total dari baris lain > 0.
    const failures = evaluateBudgetLock(
      okProject,
      [item({ id: 1 }), item({ id: 2, qty: 0, cost: 5 })],
      STAGES,
    )
    expect(failures.join(" ")).toContain("qty")
  })
})

describe("buildProjectBudgetHistory — A6 dari ProjectLog saja", () => {
  it("saring aksi rab_* saja, urut waktu, details terbawa apa adanya", () => {
    const t = (s: number) => new Date(2026, 9, 21, 10, s)
    const history = buildProjectBudgetHistory([
      { action: "catatan-biasa", notes: "x", details: null, userId: 1, createdAt: t(3) },
      {
        action: "rab_revision",
        notes: "Naikkan plat",
        details: { revisionNo: 1, changes: [{ projectItemId: 1, field: "cost", old: 5, new: 7 }] },
        userId: 9,
        createdAt: t(2),
      },
      { action: "rab_locked", notes: null, details: { totalBudget: 100 }, userId: 2, createdAt: t(1) },
    ])
    expect(history.map((h) => h.action)).toEqual(["rab_locked", "rab_revision"])
    expect(history[1].userId).toBe(9)
    expect(history[1].details).toMatchObject({ revisionNo: 1 })
  })
})
