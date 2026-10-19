/**
 * Helper bersama tes validasi (create*-validation, tax-payment-period,
 * recurring-run-now-journal).
 * `vi.mock` tetap literal di tiap berkas tes karena hoisting Vitest;
 * factory di bawah hanya didelegasikan dari factory berkas pemanggil
 * dengan objek `mocks` hoisted pemanggil. Nilai mock tidak berubah.
 */
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
