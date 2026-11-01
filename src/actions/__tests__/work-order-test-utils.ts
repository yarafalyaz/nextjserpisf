import { vi } from "vitest"

// Shared WorkOrder action test scaffolding (Sonar duplication gate):
// standard module mocks shared by update-work-order-guard + revise suites.
export function createWorkOrderMocks() {
  const m = {
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    woFindUniqueOrThrow: vi.fn(),
    transactionMock: vi.fn(),
  }
  return {
    ...m,
    mockAuth: () => ({ requirePermission: m.requirePermissionMock }),
    mockPrisma: () => ({
      prisma: {
        workOrder: { findUniqueOrThrow: m.woFindUniqueOrThrow },
        // Gerbang hidup penulis WO (putaran 36): customer hidup + item hidup.
        customer: { findFirst: vi.fn().mockResolvedValue({ id: 1 }) },
        item: {
          findMany: vi.fn().mockImplementation(async (args: any) =>
            (args?.where?.id?.in ?? []).map((id: number) => ({ id, name: `Item ${id}`, isActive: true })),
          ),
        },
        $transaction: m.transactionMock,
      },
    }),
    mockActivity: () => ({ logActivity: m.logActivityMock }),
    mockCache: () => ({ revalidatePath: m.revalidateMock }),
    mockPeriod: () => ({ assertPeriodOpen: vi.fn().mockResolvedValue(undefined) }),
  }
}
