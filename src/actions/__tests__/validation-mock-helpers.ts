/**
 * Helper bersama tes validasi (create*-validation, tax-payment-period,
 * recurring-run-now-journal).
 * `vi.mock` tetap literal di tiap berkas tes karena hoisting Vitest;
 * factory di bawah hanya didelegasikan dari factory berkas pemanggil
 * dengan objek `mocks` hoisted pemanggil. Nilai mock tidak berubah.
 */
import { vi } from "vitest"

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

/** Model mock generik tes aksi: finder kosong, create ter-resolve `createResult`. */
export function buildModelMock(createResult: unknown = { id: 99 }) {
  return {
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(createResult),
    update: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  }
}

export const approvalFactory = () => ({
  requestApprovalIfConfigured: () => Promise.resolve(undefined),
  assertApproved: () => Promise.resolve(undefined),
})

/** Basis mock hoisted aksi penjualan revisi (selisih + revisi-turun). */
export function buildSalesRevisionPrismaMock(extra: Record<string, unknown> = {}) {
  const prismaMock: Record<string, any> = {
    quotation: buildModelMock(),
    salesOrder: buildModelMock(),
    workOrder: buildModelMock(),
    salesInvoice: buildModelMock(),
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

