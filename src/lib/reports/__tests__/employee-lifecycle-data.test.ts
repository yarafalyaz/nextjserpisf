import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader daftar perhatian siklus hidup karyawan (F-2026-10-22-085-S, F-1 audit
 * t_07ba8f0c). Builder murni terkunci di employee-lifecycle.test.ts; di sini
 * yang dijaga adalah rantai loader->builder: pemetaan field apa adanya dari
 * baris Employee, scope HR diterapkan ke where (hrEmployeeScopeWhere),
 * deletedAt:null, select tanpa field gaji, dan `today` diteruskan.
 */

const mocks = vi.hoisted(() => ({
  employeeFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { employee: { findMany: mocks.employeeFindMany } },
}))

import { loadEmployeeLifecycleAttention } from "../employee-lifecycle-data"
import type { HrScope } from "@/lib/auth/hr-scope"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const TODAY = d("2026-10-22")

function empRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Budi",
    employmentStatus: "PKWTT",
    contractEndDate: null,
    employmentEndedAt: null,
    endReason: null,
    isActive: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.employeeFindMany.mockResolvedValue([])
})

describe("loadEmployeeLifecycleAttention — rantai loader F-085-S", () => {
  it("pemetaan field apa adanya: status/tanggal/alasan/nama/isActive diteruskan ke builder", async () => {
    const endedAt = d("2026-10-15")
    const contractEnd = d("2026-11-11")
    mocks.employeeFindMany.mockResolvedValue([
      empRow({ id: 2, name: "Sari", employmentStatus: "PKWT", contractEndDate: contractEnd }),
      empRow({ id: 1, name: "Budi", employmentEndedAt: endedAt, endReason: "resigned" }),
      empRow({ id: 3, name: "Joko", employmentStatus: null, isActive: false }),
    ])

    const rows = await loadEmployeeLifecycleAttention({ kind: "all" }, TODAY)

    expect(rows.map((r) => [r.employeeId, r.kind])).toEqual([
      [1, "endedButActive"],
      [2, "contractExpiring"],
      [3, "statusUnset"],
    ])
    const ended = rows[0]
    expect(ended.name).toBe("Budi")
    expect(ended.employmentStatus).toBe("PKWTT")
    expect(ended.employmentEndedAt).toBe(endedAt)
    expect(ended.endReason).toBe("resigned")
    expect(ended.endReasonLabel).toBe("Mengundurkan Diri")
    expect(ended.isActive).toBe(true)

    const expiring = rows[1]
    expect(expiring.name).toBe("Sari")
    expect(expiring.employmentStatus).toBe("PKWT")
    expect(expiring.contractEndDate).toBe(contractEnd)
    expect(expiring.employmentEndedAt).toBeNull()

    const unset = rows[2]
    expect(unset.employmentStatus).toBeNull()
    expect(unset.employmentStatusLabel).toBe("Belum diatur")
    expect(unset.isActive).toBe(false)
  })

  it("argumen query: deletedAt:null, select persis tanpa field gaji, orderBy id asc (scope all)", async () => {
    await loadEmployeeLifecycleAttention({ kind: "all" }, TODAY)

    expect(mocks.employeeFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.employeeFindMany.mock.calls[0][0]
    expect(arg).toEqual({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        employmentStatus: true,
        contractEndDate: true,
        employmentEndedAt: true,
        endReason: true,
        isActive: true,
      },
      orderBy: { id: "asc" },
    })
    expect(JSON.stringify(arg.select)).not.toMatch(/salary|gaji/i)
  })

  it.each([
    ["all", { kind: "all" } as HrScope, { deletedAt: null }],
    [
      "department berdepartemen",
      { kind: "department", departmentId: 7, employeeId: 5 } as HrScope,
      { deletedAt: null, departmentId: 7 },
    ],
    [
      "department tanpa departemen jatuh ke diri sendiri",
      { kind: "department", departmentId: null, employeeId: 5 } as HrScope,
      { deletedAt: null, id: 5 },
    ],
    ["self", { kind: "self", employeeId: 9 } as HrScope, { deletedAt: null, id: 9 }],
  ])("scope %s diterapkan ke where", async (_label, scope, expectedWhere) => {
    await loadEmployeeLifecycleAttention(scope, TODAY)

    expect(mocks.employeeFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.employeeFindMany.mock.calls[0][0].where).toEqual(expectedWhere)
  })

  it("today diteruskan ke builder, bukan tanggal sistem", async () => {
    // 2026-11-22 = 31 hari sesudah TODAY (di luar jendela <=30), tetapi 21 hari
    // sesudah 2026-11-01. Bila loader mengabaikan `today`, hasil pertama beda.
    mocks.employeeFindMany.mockResolvedValue([
      empRow({ employmentStatus: "PKWT", contractEndDate: d("2026-11-22") }),
    ])

    expect(await loadEmployeeLifecycleAttention({ kind: "all" }, TODAY)).toEqual([])
    const rows = await loadEmployeeLifecycleAttention({ kind: "all" }, d("2026-11-01"))
    expect(rows.map((r) => r.kind)).toEqual(["contractExpiring"])
  })

  it("tanpa baris karyawan -> daftar kosong", async () => {
    await expect(loadEmployeeLifecycleAttention({ kind: "self", employeeId: 9 }, TODAY)).resolves.toEqual([])
  })
})
