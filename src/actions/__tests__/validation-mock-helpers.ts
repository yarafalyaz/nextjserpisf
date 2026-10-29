/**
 * Helper bersama tes validasi (create*-validation, tax-payment-period,
 * recurring-run-now-journal).
 * `vi.mock` tetap literal di tiap berkas tes karena hoisting Vitest;
 * factory di bawah hanya didelegasikan dari factory berkas pemanggil
 * dengan objek `mocks` hoisted pemanggil. Nilai mock tidak berubah.
 */
import { expect, vi } from "vitest"

type AnyMocks = Record<string, any>

export const permissionFactory = (m: AnyMocks) => ({ requirePermission: (...a: unknown[]) => m.requirePermission(...a) })
export const activityLogFactory = (m: AnyMocks) => ({ logActivity: (...a: unknown[]) => m.logActivity(...a) })
export const revalidateFactory = (m: AnyMocks) => ({ revalidatePath: (...a: unknown[]) => m.revalidatePath(...a) })
export const docNumberFactory = (m: AnyMocks) => ({ generateDocumentNumber: (...a: unknown[]) => m.generateDocumentNumber(...a) })
export const periodLockFactory = (m: AnyMocks) => ({ assertPeriodOpen: (...a: unknown[]) => m.assertPeriodOpen(...a) })
export const docSequenceFactory = () => ({ DocumentSequenceService: { nextBatch: () => Promise.resolve([1]) } })
export const slugFixedFactory = () => ({ nextSlug: () => Promise.resolve("slug-x") })
export const slugMockFactory = (m: AnyMocks) => ({ nextSlug: (...a: unknown[]) => m.nextSlug(...a) })
export const prismaFactory = (m: AnyMocks, key = "prisma") => ({ prisma: m[key] })

export function formFormData(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

/**
 * Model mock generik tes aksi: finder kosong, create ter-resolve `createResult`.
 * Metode tulis massal ikut disediakan (createMany/updateMany/delete/deleteMany/
 * upsert/aggregate) supaya berkas uji tidak menulis ulang daftar metode yang
 * sama — duplikasi blok itulah yang dulu memerahkan SonarCloud pada kode baru.
 * Nilai bawaan identik dengan yang dipakai tes aksi sebelumnya.
 */
export function buildModelMock(createResult: unknown = { id: 99 }) {
  return {
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(createResult),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  }
}

export const approvalFactory = () => ({
  requestApprovalIfConfigured: () => Promise.resolve(undefined),
  assertApproved: () => Promise.resolve(undefined),
})

/** Basis mock hoisted aksi penjualan revisi (selisih + revisi-turun + progres). */
export function buildSalesRevisionPrismaMock(extra: Record<string, unknown> = {}) {
  const prismaMock: Record<string, any> = {
    quotation: buildModelMock(),
    salesOrder: buildModelMock(),
    workOrder: buildModelMock(),
    salesInvoice: buildModelMock(),
    // F-2026-10-25-035-B: gerbang kredit membaca saklar; mock default
    // findFirst null = saklar mati (perilaku persis sebelum gerbang).
    systemSetting: buildModelMock(),
    customer: buildModelMock(),
    downPayment: buildModelMock(),
    customerCredit: buildModelMock(),
    salesReturn: buildModelMock(),
    journal: buildModelMock(),
    creditOverride: buildModelMock(),
    ...extra,
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
  prismaMock.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
  return prismaMock
}

/** Setup beforeEach bersama: izin + penawaran revisi + SO/WO kosong. */
export function setupSalesRevisionBase(mocks: AnyMocks, quotation: Record<string, unknown>) {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
  mocks.prismaMock.quotation.findFirst.mockResolvedValue(quotation)
  mocks.prismaMock.salesOrder.findMany.mockResolvedValue([])
  mocks.prismaMock.workOrder.findMany.mockResolvedValue([])
}

/** Fixture penawaran terikat kontrak bersama tes penjualan revisi. */
export const REVISION_CONTRACT_QUOTATION = {
  id: 5,
  documentNo: "QUO-2026-005",
  customerId: 3,
  customerVehicleId: 9,
  grandTotal: 1500000,
  revisionNumber: 2,
} as const

/** Satu faktur lama tertagih bersama tes penjualan revisi. */
export const REVISION_BILLED_INVOICE = [{ id: 11, status: "posted", grandTotal: 1000000 }] as const

/** Sisi `return` mock hoisted bersama aksi penjualan revisi. */
export function buildSalesRevisionMocks(prismaMock: Record<string, any>, docNo: string) {
  const requirePermissionMock = vi.fn().mockResolvedValue({ id: 7 })
  return {
    prismaMock,
    requirePermissionMock,
    requirePermission: requirePermissionMock,
    revalidatePath: vi.fn(),
    assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn().mockResolvedValue(undefined),
    generateDocumentNumber: vi.fn().mockResolvedValue(docNo),
  }
}


/**
 * Registrasi delapan vi.mock bersama tes aksi penjualan revisi.
 * File pemanggil tetap menulis `vi.mock` literal (hoisting Vitest);
 * helper ini hanya dipanggil di dalam callback tiap blok.
 */
export function registerSalesRevisionMocks(mocks: AnyMocks) {
  return {
    prisma: () => prismaFactory(mocks, "prismaMock"),
    permissions: () => permissionFactory(mocks),
    cache: () => revalidateFactory(mocks),
    docNumber: () => docNumberFactory(mocks),
    slug: () => slugFixedFactory(),
    periodLock: () => periodLockFactory(mocks),
    activityLog: () => activityLogFactory(mocks),
    approval: () => approvalFactory(),
  }
}

/** Aserti penolakan bersama tes RevisionDown: gagal, pesan, tanpa create kredit. */
export function expectRevisionDownRejection(mocks: AnyMocks, res: { success: boolean; error?: string }, message: string) {
  expect(res.success).toBe(false)
  expect(res.error).toContain(message)
  expect(mocks.prismaMock.customerCredit.create).not.toHaveBeenCalled()
}

/**
 * FormData dari pasangan kunci-nilai (angka dinormalisasi via String;
 * null/undefined dilewati). Satu definisi bersama supaya berkas tes aksi
 * tidak mengulang helper identik yang memerahkan duplikasi SonarCloud.
 */
export function buildFormData(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

/**
 * Factory vi.mock bersama rantai purchase (inventory/notification/approval/
 * GR-hook/PO-hook/purchase-return-hook). Dipanggil dari DALAM tiap
 * `vi.mock("...", ...)` di berkas tes supaya blok mock identik tidak ditulis
 * ulang per berkas (sumber duplikasi SonarCloud).
 */
export const purchaseChainMockFactories = {
  inventory: () => ({
    inventoryService: { receivePurchase: vi.fn().mockResolvedValue({}), processPurchaseReturn: vi.fn().mockResolvedValue({}) },
  }),
  notification: () => ({
    notificationService: { notifyAdmins: vi.fn().mockResolvedValue({}) },
  }),
  approval: () => ({
    requestApprovalIfConfigured: vi.fn().mockResolvedValue({}),
    assertApproved: vi.fn().mockResolvedValue({}),
  }),
  goodsReceiptHook: () => ({
    onGoodsReceiptVerified: vi.fn().mockResolvedValue({}),
  }),
  purchaseOrderHook: () => ({
    onPurchaseOrderCreated: vi.fn().mockResolvedValue({}),
  }),
} as const

export async function purchaseReturnHookFactory() {
  const actual = await import("@/lib/hooks/purchase-return.hook")
  return { ...actual, onPurchaseReturnProcessed: vi.fn().mockResolvedValue({}) }
}

/**
 * Isi prismaMock hoisted dari daftar model + pasang $transaction/$queryRaw/
 * $executeRaw standar. Dipanggil dari DALAM factory `vi.mock("@/lib/db/prisma")`
 * (async, impor helper ini di dalam factory) supaya blok pengisi mock yang
 * identik antar berkas tes tidak ditulis ulang per berkas.
 */
export function fillPrismaMock(
  mocks: { prismaMock: Record<string, unknown>; prismaModels: string[] },
  buildModelMock: (createResult?: unknown) => unknown,
): Record<string, unknown> {
  const prismaMock = mocks.prismaMock
  for (const model of mocks.prismaModels) prismaMock[model] = buildModelMock({ id: 1 })
  const tx = prismaMock as Record<string, unknown>
  tx.$transaction = vi.fn(async (ops: unknown) =>
    typeof ops === "function" ? (ops as (t: unknown) => unknown)(prismaMock) : Promise.all(ops as unknown[]),
  )
  tx.$queryRaw = vi.fn().mockResolvedValue([])
  tx.$executeRaw = vi.fn().mockResolvedValue(0)
  return prismaMock
}


/** Aserti entri jurnal seimbang (debit = kredit); kembalikan entri. */
export function expectJournalEntriesBalanced<T extends { debit: number; credit: number }>(
  entries: T[],
): T[] {
  const debit = entries.reduce((s, e) => s + e.debit, 0)
  expect(debit).toBe(entries.reduce((s, e) => s + e.credit, 0))
  return entries
}

/** Nama modul yang didaftarkan vi.mock tes penjualan revisi. */
export const SALES_REVISION_MODULE_NAMES = [
  "@/lib/db/prisma",
  "@/lib/auth/permissions",
  "next/cache",
  "@/lib/utils/document-number",
  "@/lib/utils/slug-db",
  "@/lib/services/period-lock.service",
  "@/lib/services/activity-log.service",
  "@/lib/services/approval-workflow.service",
] as const
