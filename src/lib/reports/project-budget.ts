/**
 * Anggaran (RAB) vs realisasi proyek — builder murni (F-2026-10-21-030
 * fase a+b, sesudah vonis Lead t_3e892715 komentar #86).
 *
 * Anggaran = baris `ProjectItem` proyek (qty × cost per baris) diagregasi
 * per (projectStageId, category). Baris tanpa tahap masuk ember eksplisit
 * "belum teralokasi" — tidak hilang, tidak dibagi rata (BR-08/BR-11).
 *
 * Realisasi = output `buildProjectPl` F-029 APA ADANYA (BR-10): builder
 * ini dilarang query agregasi kedua. Kolom tahap di sumber realisasi
 * MASIH ditunda vonis Lead (t_3e892715 #86 — dilarang tambah kolom tahap
 * ke MaterialIssue/Expense; ProductionCost via WO tak punya tahap
 * alami). Fase (c) ini mengonsumsi partisi tahap yang F-029 turunkan
 * dari baris terhitungnya sendiri (`pl.stageRealization` /
 * `pl.unallocatedRealized`) — builder ini hanya memasangkan partisi itu
 * ke daftar tahap proyek; ia tidak menghitung ulang rupiah realisasi.
 * Hari ini partisi selalu kosong (belum ada kolom tahap sah), jadi
 * seluruh realisasi tetap `unallocatedRealized` = totalCost penuh —
 * perilaku fase (b) dipertahankan persis sampai kolom tahap sah lahir
 * lewat kartu schema tersendiri. Rekonsiliasi wajib: Σ per tahap +
 * belum-dialokasi (anggaran) = ΣRAB; Σ realizedAmount per tahap +
 * unallocatedRealized = realizedTotal = totalCost F-029 (selisih 0.00).
 *
 * contractAmount adalah snapshot nilai JUAL kontrak (dari
 * Quotation.grandTotal terpilih atau manual ber-alasan), RAB adalah
 * rencana BIAYA — dua angka berbeda; marginRencana hanya informatif.
 *
 * Pure (tanpa Prisma/DOM). Sen-aman lewat `src/lib/utils/math`.
 * Loader DB ada di `project-budget-data.ts`.
 */

import { safeMultiply, safeSubtract, safeSum } from "@/lib/utils/math"
import type {
  ProjectPlResult,
  ProjectPlStageRealization,
} from "@/lib/reports/project-pl"

/** Kategori kanonik baris RAB (pola string ProductionCost.category). */
export const PROJECT_BUDGET_CATEGORIES = [
  "material",
  "labor",
  "subkontrak",
  "lain",
] as const

export type ProjectBudgetCategory = (typeof PROJECT_BUDGET_CATEGORIES)[number]

export function isProjectBudgetCategory(
  value: string | null | undefined,
): value is ProjectBudgetCategory {
  return (
    value !== null &&
    value !== undefined &&
    (PROJECT_BUDGET_CATEGORIES as readonly string[]).includes(value)
  )
}

// --- Input ---

export interface ProjectBudgetItemInput {
  id: number
  /** Tahap pemilik baris; null = belum dialokasi (menahan kunci, BR-08). */
  projectStageId: number | null
  /** Kategori kanonik; null/tak dikenal = belum sah untuk kunci (BR-02). */
  category: string | null
  qty: number
  /** Biaya satuan RENCANA snapshot baris ini. */
  cost: number
  sortOrder: number
}

export interface ProjectBudgetStageInput {
  id: number
  name: string
  sortOrder: number
}

export interface ProjectBudgetInput {
  projectId: number
  /** Snapshot kontrak; null = belum ditetapkan. */
  contractAmount: number | null
  /** Sumber snapshot: quotation terpilih, manual ber-alasan, atau belum ada. */
  contractSource: "quotation" | "manual" | null
  budgetLockedAt: Date | null
  budgetRevisionNo: number
  items: ProjectBudgetItemInput[]
  stages: ProjectBudgetStageInput[]
  /** Output buildProjectPl proyek ini, apa adanya. */
  pl: ProjectPlResult
}

// --- Output ---

export interface ProjectBudgetCategoryTotal {
  /** Kategori kanonik, atau null untuk baris tanpa kategori sah. */
  category: string | null
  amount: number
}

export interface ProjectBudgetStageTotal {
  projectStageId: number
  stageName: string | null
  categories: ProjectBudgetCategoryTotal[]
  total: number
}

/**
 * Realisasi SATU tahap dari partisi F-029 (BR-09 fase c). Selalu hadir
 * per tahap yang tercantum — tahap tanpa realisasi BUKAN ditebak UI:
 * `hasRealization` false + `realizedAmount` 0 + `bySource` semua 0.
 */
export interface ProjectBudgetStageRealization {
  projectStageId: number
  stageName: string | null
  /** Σ realisasi teralokasi ke tahap ini (0 bila tidak ada). */
  realizedAmount: number
  /** false = tahap tanpa realisasi teralokasi — tampilkan eksplisit, bukan kosong/tebakan. */
  hasRealization: boolean
  /** Rincian per sumber F-029 (material/productionCost/expense/pettyCash/vendorBill). */
  bySource: ProjectPlStageRealization["bySource"]
}

export interface ProjectBudgetResult {
  projectId: number
  contractAmount: number | null
  contractSource: "quotation" | "manual" | null
  isLocked: boolean
  budgetRevisionNo: number
  /** Anggaran per tahap (hanya tahap yang dirujuk ≥1 baris), urut sortOrder tahap. */
  perStageBudget: ProjectBudgetStageTotal[]
  /** Anggaran baris tanpa tahap — ember eksplisit, tidak dibagi rata. */
  unallocatedBudget: { categories: ProjectBudgetCategoryTotal[]; total: number }
  /** Σ semua baris RAB (per tahap + belum teralokasi). */
  totalBudget: number
  /** Realisasi total = pl.totalCost F-029 persis. */
  realizedTotal: number
  /**
   * Realisasi per tahap dari partisi F-029 (`pl.stageRealization`),
   * terpasang ke daftar tahap proyek: SEMUA tahap proyek tercantum
   * (termasuk tanpa baris RAB), urut sortOrder tahap. Tahap tanpa
   * realisasi = `hasRealization` false + `realizedAmount` 0 (eksplisit).
   * Partisi berkunci projectStageId asing (di luar tahap proyek) tidak
   * dimasukkan ke sini — ia tetap di `unallocatedRealized` supaya
   * rekonsiliasi tidak pernah bocor.
   */
  perStageRealized: ProjectBudgetStageRealization[]
  /**
   * Realisasi yang belum bisa dialokasi per tahap. Hari ini =
   * realizedTotal penuh (kolom tahap sumber masih ditunda vonis Lead);
   * nanti = pl.unallocatedRealized + partisi tahap asing. Rekonsiliasi:
   * Σ perStageRealized.realizedAmount + nilai ini = realizedTotal (0.00).
   */
  unallocatedRealized: number
  /** totalBudget − realizedTotal; negatif = realisasi melewati RAB. */
  varianceTotal: number
  /** contractAmount − totalBudget; null bila kontrak belum ditetapkan. */
  marginRencana: number | null
  /** pl.revenue diteruskan apa adanya untuk konteks margin. */
  revenue: number
}

function categorySortKey(category: string | null): string {
  if (category === null) return "~~null"
  const idx = (PROJECT_BUDGET_CATEGORIES as readonly string[]).indexOf(category)
  return idx >= 0 ? `0${idx}` : `1${category}`
}

function aggregateCategories(
  items: ProjectBudgetItemInput[],
): ProjectBudgetCategoryTotal[] {
  const byCategory = new Map<string | null, number>()
  for (const item of items) {
    const key = item.category
    byCategory.set(
      key,
      safeSum([byCategory.get(key) ?? 0, safeMultiply(item.qty, item.cost, 2)], 2),
    )
  }
  return [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => categorySortKey(a.category).localeCompare(categorySortKey(b.category)))
}

export function buildProjectBudget(input: ProjectBudgetInput): ProjectBudgetResult {
  const stageById = new Map(input.stages.map((s) => [s.id, s]))

  const byStage = new Map<number, ProjectBudgetItemInput[]>()
  const unallocatedItems: ProjectBudgetItemInput[] = []
  for (const item of input.items) {
    if (item.projectStageId === null) {
      unallocatedItems.push(item)
    } else {
      const list = byStage.get(item.projectStageId) ?? []
      list.push(item)
      byStage.set(item.projectStageId, list)
    }
  }

  const perStageBudget: ProjectBudgetStageTotal[] = [...byStage.entries()]
    .map(([projectStageId, items]) => {
      const categories = aggregateCategories(items)
      return {
        projectStageId,
        stageName: stageById.get(projectStageId)?.name ?? null,
        categories,
        total: safeSum(categories.map((c) => c.amount), 2),
      }
    })
    .sort((a, b) => {
      const orderA = stageById.get(a.projectStageId)?.sortOrder ?? Number.MAX_SAFE_INTEGER
      const orderB = stageById.get(b.projectStageId)?.sortOrder ?? Number.MAX_SAFE_INTEGER
      return orderA - orderB || a.projectStageId - b.projectStageId
    })

  const unallocatedCategories = aggregateCategories(unallocatedItems)
  const unallocatedTotal = safeSum(unallocatedCategories.map((c) => c.amount), 2)
  const totalBudget = safeSum(
    [...perStageBudget.map((s) => s.total), unallocatedTotal],
    2,
  )

  const realizedTotal = input.pl.totalCost

  // Realisasi per tahap (BR-09 fase c): pasang partisi F-029 ke daftar
  // tahap proyek. Jumlah proyek-tahap selalu dari `stages` (bukan dari
  // partisi), jadi tahap tanpa realisasi tampil eksplisit 0/false.
  // Partisi ber-id di luar tahap proyek tidak diakui di sini — selisihnya
  // jatuh ke unallocatedRealized di bawah, bukan hilang.
  const realizationByStage = new Map(
    input.pl.stageRealization.map((r) => [r.projectStageId, r]),
  )
  const perStageRealized: ProjectBudgetStageRealization[] = [...input.stages]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((stage) => {
      const part = realizationByStage.get(stage.id)
      return {
        projectStageId: stage.id,
        stageName: stage.name,
        realizedAmount: part?.amount ?? 0,
        hasRealization: part !== undefined,
        bySource: part?.bySource ?? {
          material: 0,
          productionCost: 0,
          expense: 0,
          pettyCash: 0,
          vendorBill: 0,
        },
      }
    })
  const allocatedToKnownStages = safeSum(
    perStageRealized.map((r) => r.realizedAmount),
    2,
  )
  // unallocated = totalCost − teralokasi-ke-tahap-proyek. Identik dengan
  // pl.unallocatedRealized bila semua partisi menunjuk tahap proyek;
  // partisi tahap asing ikut tertampung di sini (tidak hilang).
  const unallocatedRealized = safeSubtract(realizedTotal, allocatedToKnownStages, 2)

  return {
    projectId: input.projectId,
    contractAmount: input.contractAmount,
    contractSource: input.contractSource,
    isLocked: input.budgetLockedAt !== null,
    budgetRevisionNo: input.budgetRevisionNo,
    perStageBudget,
    unallocatedBudget: { categories: unallocatedCategories, total: unallocatedTotal },
    totalBudget,
    realizedTotal,
    perStageRealized,
    unallocatedRealized,
    varianceTotal: safeSubtract(totalBudget, realizedTotal, 2),
    marginRencana:
      input.contractAmount === null
        ? null
        : safeSubtract(input.contractAmount, totalBudget, 2),
    revenue: input.pl.revenue,
  }
}

// --- Penjaga kunci (BR-02) — murni, dipakai aksi kunci & bisa diuji ---

export interface BudgetLockProjectInput {
  contractAmount: number | null
  budgetLockedAt: Date | null
  /** Status proyek turunan tahap (computeProjectStatus) / status tersimpan. */
  projectStatus: string
}

/**
 * Daftar prasyarat kunci yang GAGAL (kosong = boleh kunci). Pesan Bahasa
 * Indonesia menyebut prasyaratnya satu per satu — acceptance A3.
 * BR-13: proyek completed tidak boleh dikunci retroaktif.
 */
export function evaluateBudgetLock(
  project: BudgetLockProjectInput,
  items: ProjectBudgetItemInput[],
  stages: ProjectBudgetStageInput[],
): string[] {
  const failures: string[] = []

  if (project.budgetLockedAt !== null) {
    failures.push("Anggaran proyek ini sudah terkunci")
  }
  if (project.projectStatus === "completed") {
    failures.push("Proyek sudah selesai (completed) — RAB tidak dapat dikunci retroaktif")
  }
  if (project.contractAmount === null || project.contractAmount <= 0) {
    failures.push("Nilai kontrak (contractAmount) belum terisi atau tidak lebih dari 0")
  }
  if (items.length === 0) {
    failures.push("Belum ada baris RAB")
    return failures
  }

  const stageIds = new Set(stages.map((s) => s.id))
  let hasOrphanStage = false
  let hasInvalidCategory = false
  let hasInvalidQtyCost = false
  for (const item of items) {
    if (item.projectStageId === null || !stageIds.has(item.projectStageId)) {
      hasOrphanStage = true
    }
    if (!isProjectBudgetCategory(item.category)) {
      hasInvalidCategory = true
    }
    if (!(item.qty > 0) || !(item.cost >= 0)) {
      hasInvalidQtyCost = true
    }
  }
  if (hasOrphanStage) {
    failures.push("Masih ada baris RAB tanpa tahap proyek yang sah")
  }
  if (hasInvalidCategory) {
    failures.push(
      `Masih ada baris RAB tanpa kategori kanonik (${PROJECT_BUDGET_CATEGORIES.join("/")})`,
    )
  }
  if (hasInvalidQtyCost) {
    failures.push("Masih ada baris RAB dengan qty ≤ 0 atau biaya satuan negatif")
  }

  const total = safeSum(items.map((i) => safeMultiply(i.qty, i.cost, 2)), 2)
  if (total <= 0) {
    failures.push("Total RAB harus lebih dari 0")
  }

  return failures
}

// --- Riwayat revisi dari ProjectLog saja (A6) ---

export interface ProjectBudgetLogInput {
  action: string
  notes: string | null
  details: unknown
  userId: number | null
  createdAt: Date
}

export interface ProjectBudgetHistoryEntry {
  action: string
  notes: string | null
  details: unknown
  userId: number | null
  createdAt: Date
}

/** Aksi log RAB yang menjadi riwayat resmi anggaran proyek. */
export const PROJECT_BUDGET_LOG_ACTIONS = [
  "rab_contract_snapshot",
  "rab_contract_manual",
  "rab_locked",
  "rab_revision_proposed",
  "rab_revision",
  "rab_revision_rejected",
] as const

/**
 * Saring + urutkan baris ProjectLog menjadi riwayat RAB. Cukup baris log
 * saja untuk merekonstruksi siapa/kapan/alasan/nilai lama→baru tiap
 * perubahan anggaran (details terstruktur ditulis aksi RAB).
 */
export function buildProjectBudgetHistory(
  logs: ProjectBudgetLogInput[],
): ProjectBudgetHistoryEntry[] {
  const allowed = new Set<string>(PROJECT_BUDGET_LOG_ACTIONS)
  return logs
    .filter((log) => allowed.has(log.action))
    .map((log) => ({
      action: log.action,
      notes: log.notes,
      details: log.details ?? null,
      userId: log.userId,
      createdAt: log.createdAt,
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}
