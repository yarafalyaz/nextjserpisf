import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createAppreciation,
  updateAppreciation,
  deleteAppreciation,
  recordEmployeeLoanCashRepayment,
  writeOffEmployeeLoan,
} from "../hrm.actions"

// BUGHUNT round3 #9 + #10.
// #9: appreciation create/update/delete wajib HR scope atas employeeId target;
//     update/delete muat baris existing dulu dan cek employeeId-nya.
// #10: setoran tunai + write-off pinjaman wajib kunci baris loan (FOR UPDATE)
//      di dalam tx lalu baca ulang status/sisa di dalam tx — baca di luar tx
//      memberi sisa basi sehingga dua pembayaran konkuren sama-sama lolos.
// hr-scope TIDAK di-mock: perilaku scope asli yang diuji (mock prisma.employee).

const mocks = vi.hoisted(() => {
  const order: string[] = []
  const tx = {
    $queryRaw: vi.fn(async () => {
      order.push("lock")
      return [{ id: 1 }]
    }),
    // Putaran 62: createAppreciation kini menulis lewat tx (klaim
    // idempotency + create atomik), jadi tx mock wajib membawa modelnya.
    appreciation: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
      // Putaran 70: update menilai ulang baris lewat delegate tx; slug
      // dihitung nextSlugWithClient atas bacaan delegate tx ini.
      findUniqueOrThrow: vi.fn(async () => ({ employeeId: 7 })),
      findFirst: vi.fn(async () => null),
      update: vi.fn().mockResolvedValue({ id: 1 }),
    },
    idempotencyKey: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    employeeLoan: {
      findUniqueOrThrow: vi.fn(async () => {
        order.push("txLoanRead")
        return { id: 3, employeeId: 1, status: "active", remainingAmount: 400000 }
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    employeeLoanRepayment: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 11 }),
    },
    employeeLoanWriteOff: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 12 }),
    },
  }
  const prismaMock = {
    appreciation: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({ id: 1 }),
      delete: vi.fn().mockResolvedValue({}),
    },
    employee: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    employeeLoan: {
      findUniqueOrThrow: vi.fn(),
    },
    employeeLoanRepayment: { findFirst: vi.fn().mockResolvedValue(null) },
    employeeLoanWriteOff: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  }
  return {
    order,
    tx,
    prismaMock,
    requirePermissionMock: vi.fn(),
    onCashRepaymentMock: vi.fn(),
    onWrittenOffMock: vi.fn(),
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
  requireAnyPermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))

vi.mock("@/lib/hooks/accounting.hook", () => ({
  onPayrollPaid: vi.fn(),
  deleteJournalByReferenceTx: vi.fn(),
  reverseJournalsByReferenceTx: vi.fn(),
  onEmployeeLoanCashRepayment: (...a: unknown[]) => mocks.onCashRepaymentMock(...a),
  onEmployeeLoanWrittenOff: (...a: unknown[]) => mocks.onWrittenOffMock(...a),
}))

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

const repaymentForm = (amount: string) =>
  fd({ loanId: "3", amount, cashAccountId: "100", repaymentDate: "2026-10-29", notes: "setor tunai" })

describe("BUGHUNT #9 — appreciation HR scope", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.order.length = 0
    // Aktor staff tertaut employee 7 -> scope self (bukan all-access).
    mocks.requirePermissionMock.mockResolvedValue({ id: 2, roles: ["staff"] })
    mocks.prismaMock.employee.findFirst.mockResolvedValue({ id: 7, departmentId: 3 })
    mocks.prismaMock.appreciation.findUniqueOrThrow.mockResolvedValue({ employeeId: 7 })
  })

  it("create untuk karyawan luar scope ditolak, nol create", async () => {
    const res = await createAppreciation(fd({ employeeId: "99", date: "2026-06-12", amount: "500000" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak memiliki akses")
    expect(mocks.prismaMock.appreciation.create).not.toHaveBeenCalled()
  })

  it("create untuk karyawan dalam scope lolos", async () => {
    const res = await createAppreciation(fd({ employeeId: "7", date: "2026-06-12", amount: "500000" }))
    expect(res?.success).toBe(true)
    // Putaran 62: create berjalan lewat tx, bukan prisma root.
    expect(mocks.tx.appreciation.create).toHaveBeenCalled()
  })

  it("update baris milik karyawan luar scope ditolak walau employeeId kiriman dalam scope", async () => {
    mocks.prismaMock.appreciation.findUniqueOrThrow.mockResolvedValue({ employeeId: 99 })
    const res = await updateAppreciation(fd({ id: "1", employeeId: "7", date: "2026-06-12", amount: "1" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.appreciation.update).not.toHaveBeenCalled()
  })

  it("update memindah ke karyawan luar scope ditolak, nol update", async () => {
    const res = await updateAppreciation(fd({ id: "1", employeeId: "99", date: "2026-06-12", amount: "1" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.appreciation.update).not.toHaveBeenCalled()
  })

  it("update dalam scope (tanpa pindah karyawan) lolos", async () => {
    const res = await updateAppreciation(fd({ id: "1", employeeId: "7", date: "2026-06-12", amount: "1" }))
    expect(res?.success).toBe(true)
    // Putaran 70: tulis berjalan lewat delegate tx, bukan prisma root.
    expect(mocks.tx.appreciation.update).toHaveBeenCalled()
  })

  it("regresi putaran 47: create untuk karyawan nonaktif/terhapus ditolak (gerbang hidup), nol create", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    // Gerbang hidup menilai where {id, isActive, deletedAt}: karyawan mati
    // -> null. Query scope (where userId) tetap aktor hidup.
    mocks.prismaMock.employee.findFirst.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where?.isActive === true ? null : { id: 7, departmentId: 3 },
    )
    const res = await createAppreciation(fd({ employeeId: "7", date: "2026-06-12", amount: "500000" }))
    expect(res?.success).toBe(false)
    if (!res?.success) expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.appreciation.create).not.toHaveBeenCalled()
  })

  it("regresi putaran 47: update memindah ke karyawan nonaktif ditolak, nol update", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    mocks.prismaMock.employee.findFirst.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where?.isActive === true ? null : { id: 7, departmentId: 3 },
    )
    const res = await updateAppreciation(fd({ id: "1", employeeId: "99", date: "2026-06-12", amount: "1" }))
    expect(res?.success).toBe(false)
    if (!res?.success) expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.appreciation.update).not.toHaveBeenCalled()
  })

  it("delete baris karyawan luar scope ditolak, nol delete", async () => {
    mocks.prismaMock.appreciation.findUniqueOrThrow.mockResolvedValue({ employeeId: 99 })
    const res = await deleteAppreciation(1)
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.appreciation.delete).not.toHaveBeenCalled()
  })

  it("delete dalam scope lolos", async () => {
    const res = await deleteAppreciation(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.appreciation.delete).toHaveBeenCalled()
  })
})

describe("BUGHUNT #10 — kunci baris pinjaman dalam tx", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.order.length = 0
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    // Baca pra-tx hanya untuk scope: { employeeId }.
    mocks.prismaMock.employeeLoan.findUniqueOrThrow.mockResolvedValue({ employeeId: 1 })
    mocks.tx.employeeLoan.findUniqueOrThrow.mockImplementation(async () => {
      mocks.order.push("txLoanRead")
      return { id: 3, employeeId: 1, status: "active", remainingAmount: 400000 }
    })
    mocks.tx.employeeLoanRepayment.findFirst.mockResolvedValue(null)
    mocks.tx.employeeLoanRepayment.create.mockResolvedValue({ id: 11 })
    mocks.tx.employeeLoanWriteOff.findFirst.mockResolvedValue(null)
    mocks.tx.employeeLoanWriteOff.create.mockResolvedValue({ id: 12 })
  })

  it("setoran: lock mendahului baca ulang loan di dalam tx", async () => {
    const res = await recordEmployeeLoanCashRepayment(repaymentForm("100000"))
    expect(res?.success).toBe(true)
    expect(mocks.tx.$queryRaw).toHaveBeenCalled()
    expect(mocks.order.indexOf("lock")).toBeLessThan(mocks.order.indexOf("txLoanRead"))
    const upd = mocks.tx.employeeLoan.update.mock.calls.at(-1)?.[0] as { data: { remainingAmount: number; status: string } }
    expect(upd.data.remainingAmount).toBe(300000)
    expect(mocks.onCashRepaymentMock).toHaveBeenCalled()
  })

  it("setoran: sisa segar dalam tx (turun konkuren) menolak nominal yang lolos dari sisa basi", async () => {
    // Sisa pra-tx tidak lagi dibaca untuk penjaga; di dalam tx sisa tinggal 100rb.
    mocks.tx.employeeLoan.findUniqueOrThrow.mockImplementation(async () => {
      mocks.order.push("txLoanRead")
      return { id: 3, employeeId: 1, status: "active", remainingAmount: 100000 }
    })
    const res = await recordEmployeeLoanCashRepayment(repaymentForm("300000"))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/melebihi sisa/)
    expect(mocks.tx.employeeLoanRepayment.create).not.toHaveBeenCalled()
    expect(mocks.tx.employeeLoan.update).not.toHaveBeenCalled()
  })

  it("setoran: status berubah konkuren di dalam tx (paid_off) ditolak", async () => {
    mocks.tx.employeeLoan.findUniqueOrThrow.mockImplementation(async () => {
      mocks.order.push("txLoanRead")
      return { id: 3, employeeId: 1, status: "paid_off", remainingAmount: 0 }
    })
    const res = await recordEmployeeLoanCashRepayment(repaymentForm("100000"))
    expect(res?.success).toBe(false)
    expect(mocks.tx.employeeLoanRepayment.create).not.toHaveBeenCalled()
  })

  it("write-off: lock + nominal dari sisa segar dalam tx, bukan sisa basi", async () => {
    mocks.tx.employeeLoan.findUniqueOrThrow.mockImplementation(async () => {
      mocks.order.push("txLoanRead")
      return { id: 3, employeeId: 1, status: "active", remainingAmount: 250000 }
    })
    const res = await writeOffEmployeeLoan(
      fd({ loanId: "3", writeOffDate: "2026-10-29", reason: "tak tertagih" }),
    )
    expect(res?.success).toBe(true)
    expect(mocks.order.indexOf("lock")).toBeLessThan(mocks.order.indexOf("txLoanRead"))
    const created = mocks.tx.employeeLoanWriteOff.create.mock.calls.at(-1)?.[0] as { data: { amount: number } }
    expect(created.data.amount).toBe(250000)
    expect(mocks.onWrittenOffMock).toHaveBeenCalled()
  })

  it("setoran: tanggal kalender mustahil ditolak, nol dokumen (putaran 20)", async () => {
    const res = await recordEmployeeLoanCashRepayment(
      fd({ loanId: "3", amount: "100000", cashAccountId: "100", repaymentDate: "2026-02-30", notes: "setor tunai" }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/tanggal/i)
    expect(mocks.tx.employeeLoanRepayment.create).not.toHaveBeenCalled()
    expect(mocks.tx.employeeLoan.update).not.toHaveBeenCalled()
  })

  it("write-off: tanggal kalender mustahil ditolak, nol dokumen (putaran 20)", async () => {
    const res = await writeOffEmployeeLoan(
      fd({ loanId: "3", writeOffDate: "2026-02-30", reason: "tak tertagih" }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/tanggal/i)
    expect(mocks.tx.employeeLoanWriteOff.create).not.toHaveBeenCalled()
    expect(mocks.tx.employeeLoan.update).not.toHaveBeenCalled()
  })

  it("write-off: status paid_off hasil balapan konkuren ditolak, nol dokumen", async () => {
    mocks.tx.employeeLoan.findUniqueOrThrow.mockImplementation(async () => {
      mocks.order.push("txLoanRead")
      return { id: 3, employeeId: 1, status: "paid_off", remainingAmount: 0 }
    })
    const res = await writeOffEmployeeLoan(
      fd({ loanId: "3", writeOffDate: "2026-10-29", reason: "tak tertagih" }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/lunas/)
    expect(mocks.tx.employeeLoanWriteOff.create).not.toHaveBeenCalled()
    expect(mocks.tx.employeeLoan.update).not.toHaveBeenCalled()
  })
})
