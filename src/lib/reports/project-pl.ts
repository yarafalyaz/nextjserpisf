/**
 * Laba/rugi proyek — builder murni sumber tunggal (F-2026-10-21-029).
 *
 * Memperbaiki cakupan halaman `laporan/laba-rugi-proyek` existing yang
 * mengagregasi langsung di page tanpa ProductionCost dan tanpa jembatan
 * invoice lewat WO/quotation, lalu detail proyek yang memakai quotation
 * per-customerId (tercampur antar proyek). Builder ini menjadi satu-satunya
 * tempat aturan uang ditentukan; loader DB ada di `project-pl-data.ts`,
 * dan halaman (frontend, task terpisah) wajib mengonsumsi output apa adanya.
 *
 * Pendapatan = SalesInvoice dengan subtotal − discount (tanpa pajak),
 * status posted/partial/paid, deletedAt null — definisi yang sama persis
 * dengan page existing (diskon header tetap dikurangi; pajak tidak ikut).
 * Invoice dijangkau dari DUA jembatan lalu di-dedup per id:
 *   1. `projectId` langsung pada invoice.
 *   2. Jembatan WO: `quotationId` invoice tertaut quotation yang terhubung
 *      ke WO proyek ini (WO ber-projectId proyek itu).
 * Invoice ber-`projectId` proyek lain tetap milik proyek itu, bukan
 * dipinjam lewat jembatan quotation bersama.
 * Dedup per invoice id wajib: invoice yang ber-projectId langsung DAN
 * terjangkau jembatan quotation tidak boleh terhitung dua kali.
 *
 * Biaya, tiga sumber berlabel terpisah (tidak digabung tanpa jejak):
 *   - Material: MaterialIssue completed ber-`projectId` langsung, atau
 *     ber-`workOrderId` pada WO proyek ini (jembatan WO) — dedup per MI id
 *     supaya MI yang punya projectId DAN tertaut WO proyek yang sama tidak
 *     dobel. Nilai = Σ qty × cost per baris (snapshot cost issue).
 *   - ProductionCost: terikat WO proyek ini (`WorkOrder.projectId`,
 *     `ProductionCost.workOrderId`), `amount` snapshot existing — termasuk
 *     labor hasil pull timesheet (`sourceTimesheetId`) dan subkontrak jasa
 *     yang dicerminkan dari VendorBill PO jasa (`purchaseOrderId`). Itulah
 *     sebabnya VendorBill di bawah disaring anti-dobel.
 *   - Beban lain: Expense approved ber-projectId + PettyCash OUT
 *     ber-projectId + VendorBill ber-projectId status
 *     confirmed/posted/partial/paid (pola page existing — draft belum
 *     beban), dengan pengecualian anti-dobel dari backlog F-029:
 *     VendorBill yang `purchaseOrderId`-nya sudah tercermin sebagai
 *     ProductionCost proyek ini (cerminan subkontrak PO jasa lewat
 *     `syncServicePoCostFromBills`) dikeluarkan dari sumber VendorBill
 *     langsung. Saringan ini di lapisan builder lewat himpunan
 *     purchaseOrderId ProductionCost proyek, supaya aturan ini bisa
 *     diuji tanpa mock Prisma.
 *
 * Timesheet yang BELUM ditarik ke ProductionCost (id-nya tidak ada sebagai
 * `sourceTimesheetId` pada ProductionCost proyek ini) dilaporkan sebagai
 * memo `unpulledTimesheetHours` — JAM saja, tanpa rupiah ditebak. Ia BUKAN
 * biaya dan tidak mengurangi laba. Timesheet yang sudah ditarik tidak
 * masuk memo (jamnya sudah hidup sebagai ProductionCost labor).
 *
 * cancelled tidak pernah dihitung di sumber mana pun (status
 * `cancelled` dibuang builder; loader juga menyaringnya di query).
 *
 * Realisasi per tahap BR-09 (F-030 fase c): kolom `projectStageId` di
 * sumber realisasi MASIH ditunda vonis Lead (t_3e892715 #86 — dilarang
 * tambah kolom ke MaterialIssue/Expense; ProductionCost via WO tak punya
 * tahap alami). Maka partisi tahap diturunkan di builder dari baris yang
 * SUDAH dihitung builder ini — satu lintasan, tanpa query agregasi kedua
 * (BR-10 tetap utuh): baris ber-`stageAllocation` adalah kandidat partisi
 * per baris yang diekstrak loader dari kolom tahap yang SAH di sumber
 * (hari ini tidak ada satupun — daftar kosong). Partisi = himpunan
 * kandidat yang juga lolos saringan kepemilikan/status/dedup/anti-dobel
 * sumbernya di atas (dijumlahkan persis cara baris itu masuk total
 * sumber); sisanya tetap `unallocated`. Invarian wajib:
 * Σ partisi per tahap + unallocated = totalCost, per sumber DAN total —
 * selisih selalu 0.00 (diuji). Bila kelak kolom tahap disetujui, loader
 * cukup mengisi `stageAllocation`; builder tidak berubah.
 *
 * Sen-aman: semua penjumlahan lewat helper `src/lib/utils/math`, dibulatkan
 * 2 desimal. Pure (tanpa Prisma/DOM).
 */

import { safeMultiply, safeRound, safeSubtract, safeSum } from "@/lib/utils/math"

/** Status invoice yang diakui sebagai pendapatan proyek. */
export const PROJECT_PL_INVOICE_STATUSES = ["posted", "partial", "paid"] as const

/** Status VendorBill yang diakui sebagai beban proyek (pola page existing). */
export const PROJECT_PL_VENDOR_BILL_STATUSES = [
  "confirmed",
  "posted",
  "partial",
  "paid",
] as const

// --- Input (satu baris per dokumen, angka number sen-aman dari loader) ---

export interface ProjectPlInvoiceInput {
  id: number
  /** projectId langsung pada invoice; null bila hanya terjangkau jembatan. */
  projectId: number | null
  /** quotationId invoice; dipakai jembatan quotation → WO proyek. */
  quotationId: number | null
  status: string
  subtotal: number
  discount: number
  deletedAt: Date | null
}

export interface ProjectPlWorkOrderInput {
  id: number
  projectId: number | null
  quotationId: number | null
  status: string
}

export interface ProjectPlMaterialIssueInput {
  id: number
  projectId: number | null
  workOrderId: number | null
  status: string
  items: { qty: number; cost: number }[]
  /**
   * Kandidat partisi BR-09 per baris dari kolom tahap yang SAH di sumber
   * (loader yang mengekstrak; null/absen = belum ada kolom tahap sah —
   * keadaan hari ini). Builder hanya menghormati kandidat yang barisnya
   * juga lolos saringan kepemilikan/status — lihat header.
   */
  stageAllocation?: ProjectPlStageAllocation | null
}

export interface ProjectPlProductionCostInput {
  workOrderId: number | null
  amount: number
  /** Kandidat partisi BR-09 — lihat `ProjectPlMaterialIssueInput`. */
  stageAllocation?: ProjectPlStageAllocation | null
  /** Timesheet sumber bila baris ini hasil pull; null = labor manual/lain. */
  sourceTimesheetId: number | null
  /** PO sumber bila baris ini cerminan subkontrak PO jasa; null = bukan. */
  purchaseOrderId: number | null
}

export interface ProjectPlExpenseInput {
  projectId: number | null
  status: string
  amount: number
  /** Kandidat partisi BR-09 — lihat `ProjectPlMaterialIssueInput`. */
  stageAllocation?: ProjectPlStageAllocation | null
}

export interface ProjectPlPettyCashInput {
  projectId: number | null
  /** Hanya `OUT` yang beban; `IN` bukan biaya proyek. */
  type: string
  amount: number
  /** Kandidat partisi BR-09 — lihat `ProjectPlMaterialIssueInput`. */
  stageAllocation?: ProjectPlStageAllocation | null
}

export interface ProjectPlVendorBillInput {
  id: number
  projectId: number | null
  purchaseOrderId: number | null
  status: string
  grandTotal: number
  deletedAt: Date | null
  /** Kandidat partisi BR-09 — lihat `ProjectPlMaterialIssueInput`. */
  stageAllocation?: ProjectPlStageAllocation | null
}

export interface ProjectPlTimesheetInput {
  id: number
  projectId: number
  hours: number
}

export interface ProjectPlInput {
  projectId: number
  invoices: ProjectPlInvoiceInput[]
  workOrders: ProjectPlWorkOrderInput[]
  materialIssues: ProjectPlMaterialIssueInput[]
  productionCosts: ProjectPlProductionCostInput[]
  expenses: ProjectPlExpenseInput[]
  pettyCash: ProjectPlPettyCashInput[]
  vendorBills: ProjectPlVendorBillInput[]
  timesheets: ProjectPlTimesheetInput[]
}

// --- Output ---

export interface ProjectPlResult {
  projectId: number
  /** Σ (subtotal − discount) invoice diakui, dedup per id. */
  revenue: number
  /** Σ MaterialIssue completed (langsung + jembatan WO), dedup per id. */
  materialCost: number
  /** Σ ProductionCost.amount pada WO proyek ini. */
  productionCost: number
  /** Σ Expense approved ber-projectId. */
  expenseCost: number
  /** Σ PettyCash OUT ber-projectId. */
  pettyCashCost: number
  /** Σ VendorBill ber-projectId sesudah saringan anti-dobel ProductionCost. */
  vendorBillCost: number
  /** materialCost + productionCost + expenseCost + pettyCashCost + vendorBillCost. */
  totalCost: number
  /** revenue − totalCost. */
  profit: number
  /** profit / revenue × 100; 0 bila revenue 0 (pola page existing). */
  marginPercent: number
  /** Id invoice yang terhitung pendapatan, urut naik — bukti dedup. */
  revenueInvoiceIds: number[]
  /** Id MI yang terhitung material, urut naik. */
  materialIssueIds: number[]
  /** Id VendorBill yang terhitung beban, urut naik. */
  vendorBillIds: number[]
  /**
   * Jam timesheet proyek yang belum ditarik ke ProductionCost proyek ini.
   * MEMO SAJA — bukan uang, tidak mengurangi laba.
   */
  unpulledTimesheetHours: number
  /** Jumlah baris timesheet di balik memo jam di atas. */
  unpulledTimesheetCount: number
  /**
   * Partisi realisasi per tahap (BR-09, F-030c), diturunkan dari baris
   * terhitung builder ini — BUKAN agregasi kedua. Hari ini selalu `[]`
   * (belum ada kolom tahap sah di sumber; vonis Lead menunda). Diurutkan
   * projectStageId naik.
   */
  stageRealization: ProjectPlStageRealization[]
  /**
   * Realisasi tanpa tahap teralokasi = totalCost − Σ stageRealization.
   * Hari ini selalu = totalCost penuh. Rekonsiliasi:
   * Σ stageRealization.amount + unallocatedRealized = totalCost (0.00).
   */
  unallocatedRealized: number
}

/**
 * Kandidat partisi realisasi per tahap untuk SATU baris sumber, diekstrak
 * loader dari kolom tahap yang sah. `projectStageId` null ATAU
 * `hasStageAllocation` false = baris tidak punya tahap yang bisa
 * dipertanggungjawabkan → masuk ember belum-teralokasi (tidak ditebak,
 * tidak dibagi rata — BR-08/BR-11).
 */
export interface ProjectPlStageAllocation {
  projectStageId: number | null
  hasStageAllocation: boolean
}

/** Sumber realisasi F-029 yang menyusun totalCost — partisi per tahap membawa sumbernya. */
export type ProjectPlRealizationSource =
  | "material"
  | "productionCost"
  | "expense"
  | "pettyCash"
  | "vendorBill"

/** Satu tahap pada partisi realisasi: total + rincian per sumber (5 sumber F-029). */
export interface ProjectPlStageRealization {
  projectStageId: number
  /** Σ material + productionCost + expense + pettyCash + vendorBill tahap ini. */
  amount: number
  bySource: Record<ProjectPlRealizationSource, number>
}

function isRecognisedInvoice(invoice: ProjectPlInvoiceInput): boolean {
  return (
    invoice.deletedAt === null &&
    (PROJECT_PL_INVOICE_STATUSES as readonly string[]).includes(invoice.status)
  )
}

function isRecognisedVendorBill(bill: ProjectPlVendorBillInput): boolean {
  return (
    bill.deletedAt === null &&
    (PROJECT_PL_VENDOR_BILL_STATUSES as readonly string[]).includes(bill.status)
  )
}

export function buildProjectPl(input: ProjectPlInput): ProjectPlResult {
  const { projectId } = input

  // WO proyek ini: jembatan untuk invoice (via quotation), MI, ProductionCost.
  const projectWorkOrders = input.workOrders.filter(
    (w) => w.projectId === projectId && w.status !== "cancelled",
  )
  const projectWorkOrderIds = new Set(projectWorkOrders.map((w) => w.id))
  const bridgeQuotationIds = new Set(
    projectWorkOrders
      .map((w) => w.quotationId)
      .filter((id): id is number => id !== null),
  )

  // Pendapatan: langsung (projectId cocok) ATAU jembatan (quotationId pada
  // himpunan quotation WO proyek). Dedup per invoice id.
  const revenueInvoices = input.invoices.filter(
    (inv) =>
      isRecognisedInvoice(inv) &&
      (inv.projectId === projectId ||
        (inv.quotationId !== null && bridgeQuotationIds.has(inv.quotationId))),
  )
  const revenueById = new Map<number, ProjectPlInvoiceInput>()
  for (const inv of revenueInvoices) revenueById.set(inv.id, inv)
  const revenue = safeSum(
    [...revenueById.values()].map((inv) => safeSubtract(inv.subtotal, inv.discount, 2)),
    2,
  )

  // Material: completed, langsung ATAU jembatan WO proyek. Dedup per MI id.
  const materialById = new Map<number, ProjectPlMaterialIssueInput>()
  for (const mi of input.materialIssues) {
    if (mi.status !== "completed") continue
    const direct = mi.projectId === projectId
    const bridged = mi.workOrderId !== null && projectWorkOrderIds.has(mi.workOrderId)
    if (direct || bridged) materialById.set(mi.id, mi)
  }
  const materialCost = safeSum(
    [...materialById.values()].map((mi) =>
      safeSum(mi.items.map((item) => safeMultiply(item.qty, item.cost, 2)), 2),
    ),
    2,
  )

  // ProductionCost: hanya yang terikat WO proyek ini.
  const projectCosts = input.productionCosts.filter(
    (c) => c.workOrderId !== null && projectWorkOrderIds.has(c.workOrderId),
  )
  const productionCost = safeSum(projectCosts.map((c) => c.amount), 2)

  // PO yang sudah tercermin sebagai ProductionCost proyek ini — VendorBill
  // dengan purchaseOrderId yang sama tidak boleh dihitung ulang.
  const mirroredPurchaseOrderIds = new Set(
    projectCosts
      .map((c) => c.purchaseOrderId)
      .filter((id): id is number => id !== null),
  )

  const expenseCost = safeSum(
    input.expenses
      .filter((e) => e.projectId === projectId && e.status === "approved")
      .map((e) => e.amount),
    2,
  )
  const pettyCashCost = safeSum(
    input.pettyCash
      .filter((p) => p.projectId === projectId && p.type === "OUT")
      .map((p) => p.amount),
    2,
  )

  const vendorBills = input.vendorBills.filter(
    (b) =>
      isRecognisedVendorBill(b) &&
      b.projectId === projectId &&
      !(b.purchaseOrderId !== null && mirroredPurchaseOrderIds.has(b.purchaseOrderId)),
  )
  const vendorBillCost = safeSum(vendorBills.map((b) => b.grandTotal), 2)

  // Partisi realisasi per tahap (BR-09): hanya baris yang SUDAH terhitung
  // di atas boleh menyumbang, dan hanya sebesar nilai yang baris itu
  // sumbang ke total sumbernya (MI: Σ qty×cost baris; lainnya: amount /
  // grandTotal baris) — partisi tidak pernah melebihi total sumbernya.
  const stageBuckets = new Map<number, Record<ProjectPlRealizationSource, number>>()
  const addStageAmount = (
    alloc: ProjectPlStageAllocation | null | undefined,
    source: ProjectPlRealizationSource,
    amount: number,
  ) => {
    if (!alloc || !alloc.hasStageAllocation || alloc.projectStageId === null) return
    const bucket = stageBuckets.get(alloc.projectStageId) ?? {
      material: 0,
      productionCost: 0,
      expense: 0,
      pettyCash: 0,
      vendorBill: 0,
    }
    bucket[source] = safeSum([bucket[source], amount], 2)
    stageBuckets.set(alloc.projectStageId, bucket)
  }
  for (const mi of materialById.values()) {
    addStageAmount(
      mi.stageAllocation,
      "material",
      safeSum(mi.items.map((item) => safeMultiply(item.qty, item.cost, 2)), 2),
    )
  }
  for (const c of projectCosts) addStageAmount(c.stageAllocation, "productionCost", c.amount)
  for (const e of input.expenses) {
    if (e.projectId === projectId && e.status === "approved") {
      addStageAmount(e.stageAllocation, "expense", e.amount)
    }
  }
  for (const p of input.pettyCash) {
    if (p.projectId === projectId && p.type === "OUT") {
      addStageAmount(p.stageAllocation, "pettyCash", p.amount)
    }
  }
  for (const b of vendorBills) addStageAmount(b.stageAllocation, "vendorBill", b.grandTotal)

  const stageRealization: ProjectPlStageRealization[] = [...stageBuckets.entries()]
    .map(([projectStageId, bySource]) => ({
      projectStageId,
      bySource,
      amount: safeSum(
        [
          bySource.material,
          bySource.productionCost,
          bySource.expense,
          bySource.pettyCash,
          bySource.vendorBill,
        ],
        2,
      ),
    }))
    .sort((a, b) => a.projectStageId - b.projectStageId)
  const allocatedRealized = safeSum(stageRealization.map((s) => s.amount), 2)

  const totalCost = safeSum(
    [materialCost, productionCost, expenseCost, pettyCashCost, vendorBillCost],
    2,
  )
  const profit = safeSubtract(revenue, totalCost, 2)
  const marginPercent =
    revenue > 0 ? safeRound((profit / revenue) * 100, 2) : 0

  // Memo jam: timesheet proyek yang id-nya belum menjadi sourceTimesheetId
  // pada ProductionCost proyek ini.
  const pulledTimesheetIds = new Set(
    projectCosts
      .map((c) => c.sourceTimesheetId)
      .filter((id): id is number => id !== null),
  )
  const unpulled = input.timesheets.filter(
    (t) => t.projectId === projectId && !pulledTimesheetIds.has(t.id),
  )
  const unpulledTimesheetHours = safeSum(unpulled.map((t) => t.hours), 2)

  return {
    projectId,
    revenue: safeRound(revenue, 2),
    materialCost: safeRound(materialCost, 2),
    productionCost: safeRound(productionCost, 2),
    expenseCost: safeRound(expenseCost, 2),
    pettyCashCost: safeRound(pettyCashCost, 2),
    vendorBillCost: safeRound(vendorBillCost, 2),
    totalCost: safeRound(totalCost, 2),
    profit,
    marginPercent,
    revenueInvoiceIds: [...revenueById.keys()].sort((a, b) => a - b),
    materialIssueIds: [...materialById.keys()].sort((a, b) => a - b),
    vendorBillIds: vendorBills.map((b) => b.id).sort((a, b) => a - b),
    unpulledTimesheetHours,
    unpulledTimesheetCount: unpulled.length,
    stageRealization,
    unallocatedRealized: safeSubtract(totalCost, allocatedRealized, 2),
  }
}
