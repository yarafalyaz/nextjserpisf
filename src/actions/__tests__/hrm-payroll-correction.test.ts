import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * HR-BR-005 (F-2026-10-28-133-S + vonis F-2026-10-28-135-V):
 * koreksi slip paid = dokumen koreksi tertaut dua arah, bukan edit/hapus.
 * Matriks E-HRCR atas head implementasi: E-HRCR-1 (alasan wajib), E-HRCR-2
 * (sah: asal utuh + 1 koreksi + reversal + jurnal koreksi + amortisasi balik),
 * E-HRCR-3 (koreksi kedua ditolak), E-HRCR-4 (periode terkunci), E-HRCR-7
 * (rekap periode asal beku — slip asal tetap paid), E-HRCR-8 (pesan tanpa
 * nominal gaji). E-HRCR-5 (resurrect approval) + E-HRCR-6 (hook re-post)
 * dikunci di approval.actions.test.ts + accounting-hook.test.ts.
 */

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const assertPeriodOpenMock = vi.fn()
const reverseJournalsMock = vi.fn()
const onPayrollPaidMock = vi.fn()
const generateDocNumMock = vi.fn()
const nextSlugMock = vi.fn()

// --- state DB tiruan per tes ---
type LoanRow = { id: number; remainingAmount: number; status: string; loanDate: Date }
let payrollById: Map<number, any>
let loansByEmployee: Map<number, LoanRow[]>
let payrollSeq: number
let componentLinesByPayroll: Map<number, any[]>
let pkwtBlocking: { id: number; status: string } | null
let forceCreateP2002 = false
let commissionPayableById: Map<number, any>
let commissionPayableUpdates: Array<{ id: number; paidAmount: number }>

const BASE_SOURCE = () => ({
  id: 1,
  documentNo: "PAYROLL-0001",
  employeeId: 9,
  period: "2026-09",
  type: "REGULAR",
  startDate: new Date("2026-09-01T00:00:00Z"),
  endDate: new Date("2026-09-30T00:00:00Z"),
  baseSalary: 5000000,
  allowances: 0,
  deductions: 0,
  overtimeTotal: 0,
  appreciationTotal: 0,
  loanDeduction: 500000,
  lateDeduction: 0,
  grossSalary: 5000000,
  bpjsHealthEmployee: 0,
  bpjsEmploymentEmployee: 0,
  pph21: 0,
  statutorySnapshot: { fromFallback: false },
  lateMinutes: 0,
  workingDays: 20,
  presentDays: 20,
  absentDays: 0,
  absentDeduction: 0,
  netSalary: 4500000,
  totalAmount: 4500000,
  paymentDate: new Date("2026-10-28T00:00:00Z"),
  costCenterId: null,
  status: "paid",
  correctsPayrollId: null,
  correctionReason: null,
})

function txClient() {
  return {
    payroll: {
      findUniqueOrThrow: async ({ where }: any) => {
        const row = payrollById.get(where.id)
        if (!row) throw new Error("not found")
        return { ...row }
      },
      findFirst: async ({ where }: any) => {
        for (const row of payrollById.values()) {
          if (where?.correctsPayrollId != null && row.correctsPayrollId === where.correctsPayrollId) {
            return { id: row.id, documentNo: row.documentNo }
          }
        }
        return null
      },
      create: async ({ data }: any) => {
        if (forceCreateP2002) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
        }
        const id = ++payrollSeq
        const row = { id, ...data }
        payrollById.set(id, row)
        return { ...row }
      },
    },
    employeeLoan: {
      findMany: async ({ where }: any) => {
        const rows = loansByEmployee.get(where?.employeeId) ?? []
        return rows.map((r) => ({ ...r }))
      },
      update: async ({ where, data }: any) => {
        for (const rows of loansByEmployee.values()) {
          const ix = rows.findIndex((r) => r.id === where.id)
          if (ix >= 0) {
            rows[ix] = { ...rows[ix], ...data }
            return { ...rows[ix] }
          }
        }
        throw new Error("loan not found")
      },
    },
    payrollComponentLine: {
      findMany: async ({ where }: any) => [...(componentLinesByPayroll.get(where?.payrollId) ?? [])],
      createMany: async ({ data }: any) => {
        for (const l of data) {
          const arr = componentLinesByPayroll.get(l.payrollId) ?? []
          arr.push({ ...l })
          componentLinesByPayroll.set(l.payrollId, arr)
        }
        return { count: data.length }
      },
      update: async ({ where, data }: any) => {
        for (const arr of componentLinesByPayroll.values()) {
          const ix = arr.findIndex((l: any) => l.id === where.id)
          if (ix >= 0) {
            arr[ix] = { ...arr[ix], ...data }
            return { ...arr[ix] }
          }
        }
        throw new Error("line not found")
      },
    },
    commissionPayable: {
      findUniqueOrThrow: async ({ where }: any) => {
        const row = commissionPayableById.get(where.id)
        if (!row) throw new Error("No CommissionPayable found")
        return row
      },
      update: async ({ where, data }: any) => {
        const row = commissionPayableById.get(where.id)
        if (!row) throw new Error("payable not found")
        row.paidAmount = data.paidAmount
        commissionPayableUpdates.push({ id: where.id, paidAmount: Number(data.paidAmount) })
        return row
      },
    },
    $executeRaw: async () => 1,
  }
}

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
  requireAnyPermission: (...a: unknown[]) => requirePermissionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payroll: {
      findUniqueOrThrow: async ({ where }: any) => {
        const row = payrollById.get(where.id)
        if (!row) throw new Error("not found")
        return { ...row }
      },
    },
    pkwtCompensationEvent: {
      findFirst: async () => pkwtBlocking,
    },
    $transaction: async (cb: any) => cb(txClient()),
  },
}))

vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => assertPeriodOpenMock(...a),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onPayrollPaid: (...a: unknown[]) => onPayrollPaidMock(...a),
  deleteJournalByReferenceTx: vi.fn(),
  reverseJournalsByReferenceTx: (...a: unknown[]) => reverseJournalsMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocNumMock(...a),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: (...a: unknown[]) => nextSlugMock(...a) }))
vi.mock("@/lib/auth/hr-scope", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/auth/hr-scope")>()
  return { ...mod, getHrScope: async () => ({ kind: "all" as const }) }
})
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))

import { correctPaidPayroll } from "../hrm.actions"

const fd = (reason: string) => {
  const f = new FormData()
  if (reason !== "__EMPTY__") f.set("reason", reason)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  forceCreateP2002 = false
  payrollById = new Map([[1, BASE_SOURCE()]])
  loansByEmployee = new Map([
    [9, [{ id: 11, remainingAmount: 1000000, status: "active", loanDate: new Date("2026-09-01T00:00:00Z") }]],
  ])
  componentLinesByPayroll = new Map()
  commissionPayableById = new Map()
  commissionPayableUpdates = []
  payrollSeq = 1
  pkwtBlocking = null
  requirePermissionMock.mockResolvedValue({ id: 7, roles: ["finance"] })
  generateDocNumMock.mockResolvedValue("PAYROLL-0002")
  nextSlugMock.mockResolvedValue("payroll-PAYROLL-0002")
  assertPeriodOpenMock.mockResolvedValue(undefined)
  reverseJournalsMock.mockResolvedValue(undefined)
  onPayrollPaidMock.mockResolvedValue(undefined)
})

describe("correctPaidPayroll E-HRCR (HR-BR-005 133-S/135-V)", () => {
  it("E-HRCR-1: alasan kosong ditolak sebelum mutasi apa pun", async () => {
    const res = await correctPaidPayroll(1, fd("__EMPTY__"))
    expect(res.success).toBe(false)
    expect(res.error).toContain("Alasan koreksi wajib diisi")
    expect(reverseJournalsMock).not.toHaveBeenCalled()
    expect(onPayrollPaidMock).not.toHaveBeenCalled()
    expect(payrollById.size).toBe(1)
  })

  it("E-HRCR-1: alasan spasi saja ditolak", async () => {
    const res = await correctPaidPayroll(1, fd("   "))
    expect(res.success).toBe(false)
    expect(reverseJournalsMock).not.toHaveBeenCalled()
  })

  it("E-HRCR-2: koreksi sah — asal utuh + 1 dokumen tertaut + reversal + amortisasi balik + jurnal koreksi", async () => {
    const res = await correctPaidPayroll(1, fd("Koreksi tunjangan kurang catat"))
    expect(res.success).toBe(true)
    // Asal tetap paid, nilai tak ditimpa.
    expect(payrollById.get(1).status).toBe("paid")
    expect(Number(payrollById.get(1).netSalary)).toBe(4500000)
    expect(payrollById.get(1).correctsPayrollId).toBeNull()
    // Tepat satu dokumen koreksi tertaut dua arah.
    const correction = payrollById.get(2)
    expect(correction.status).toBe("paid")
    expect(correction.correctsPayrollId).toBe(1)
    expect(correction.correctionReason).toBe("Koreksi tunjangan kurang catat")
    // Nilai penuh disalin (bukan delta saja).
    expect(Number(correction.grossSalary)).toBe(5000000)
    expect(Number(correction.netSalary)).toBe(4500000)
    // Rentang + periode koreksi = periode TERBUKA (135-V §2b), bukan
    // salinan rentang asal — salinan persis selalu P2002 di DB nyata
    // (uq_payroll_employee_range: asal tetap `paid` = pemblokir irisan).
    expect(correction.startDate.getTime()).not.toBe(new Date("2026-09-01T00:00:00Z").getTime())
    expect(correction.period).not.toBe("2026-09")
    expect(String(correction.period)).toMatch(/^\d{4}-\d{2}$/)
    // Urutan atomik: reversal jurnal asal lalu jurnal koreksi dokumen BARU.
    expect(reverseJournalsMock).toHaveBeenCalledTimes(1)
    expect(reverseJournalsMock.mock.calls[0].slice(1, 3)).toEqual(["Payroll", 1])
    expect(onPayrollPaidMock).toHaveBeenCalledTimes(1)
    expect(onPayrollPaidMock.mock.calls[0][0]).toBe(2)
    // Amortisasi dibalikkan: sisa pinjaman naik sebesar porsi slip ini.
    expect(loansByEmployee.get(9)![0].remainingAmount).toBe(1500000)
    // Jejak audit memuat asal + alasan + aktor, tanpa nominal gaji.
    expect(logActivityMock).toHaveBeenCalledWith(
      "correct",
      "Payroll",
      1,
      expect.stringContaining("PAYROLL-0001"),
      expect.objectContaining({ correctsPayrollId: 1, correctionId: 2, correctedBy: 7 }),
    )
    const desc = String(logActivityMock.mock.calls[0][3])
    expect(desc).not.toMatch(/[0-9]{7,}/)
  })

  it("E-HRCR-8: slip non-paid ditolak dengan menyebut nomor dokumen, tanpa nominal", async () => {
    payrollById.get(1).status = "approved"
    const res = await correctPaidPayroll(1, fd("coba koreksi"))
    expect(res.success).toBe(false)
    expect(res.error).toContain("PAYROLL-0001")
    expect(res.error).not.toMatch(/[0-9]{7,}/)
    expect(reverseJournalsMock).not.toHaveBeenCalled()
  })

  it("E-HRCR-3: koreksi kedua atas slip asal sama ditolak berisik", async () => {
    payrollById.set(2, { ...BASE_SOURCE(), id: 2, documentNo: "PAYROLL-0002", correctsPayrollId: 1 })
    const res = await correctPaidPayroll(1, fd("koreksi kedua"))
    expect(res.success).toBe(false)
    expect(res.error).toContain("PAYROLL-0002")
    expect(reverseJournalsMock).not.toHaveBeenCalled()
    expect(onPayrollPaidMock).not.toHaveBeenCalled()
    expect(payrollById.size).toBe(2)
  })

  it("E-HRCR-4: periode koreksi terkunci menolak sebelum mutasi", async () => {
    assertPeriodOpenMock.mockRejectedValueOnce(new Error("Periode akuntansi sudah ditutup"))
    const res = await correctPaidPayroll(1, fd("koreksi lintas periode"))
    expect(res.success).toBe(false)
    expect(reverseJournalsMock).not.toHaveBeenCalled()
    expect(payrollById.size).toBe(1)
  })

  it("E-HRCR-2b: restorasi amortisasi cermin alokasi tertua-dulu, dicap sisa per pinjaman", async () => {
    // markPayrollPaid mengalokasi min(sisa,budget) tertua-dulu; slip ini
    // memotong 500rb dari dua pinjaman -> pulihkan porsi yang sama, total 500rb.
    loansByEmployee = new Map([
      [9, [
        { id: 11, remainingAmount: 100000, status: "active", loanDate: new Date("2026-09-01T00:00:00Z") },
        { id: 12, remainingAmount: 800000, status: "active", loanDate: new Date("2026-09-15T00:00:00Z") },
      ]],
    ])
    const res = await correctPaidPayroll(1, fd("koreksi multi pinjaman"))
    expect(res.success).toBe(true)
    const rows = loansByEmployee.get(9)!
    // Pinjaman tertua pulih penuh 100rb (sisa cap), sisanya ke pinjaman kedua.
    expect(rows.find((r) => r.id === 11)!.remainingAmount).toBe(200000)
    expect(rows.find((r) => r.id === 12)!.remainingAmount).toBe(1200000)
  })

  it("E-HRCR-2c: P2002 rentang periode koreksi ditolak berisik tanpa nominal gaji", async () => {
    // P2002 dari create slip koreksi (rentang periode koreksi bentrok slip
    // lain) = tolak berisik tanpa nominal gaji, bukan throw mentah.
    forceCreateP2002 = true
    const res = await correctPaidPayroll(1, fd("koreksi bentrok rentang"))
    forceCreateP2002 = false
    expect(res.success).toBe(false)
    expect(res.error).toContain("rentang periode koreksi")
    expect(res.error).not.toMatch(/[0-9]{7,}/)
    expect(logActivityMock).not.toHaveBeenCalled()
    expect(payrollById.size).toBe(1)
  })

  it("komisi: tautan payable pindah ke slip koreksi + paidAmount dilepas sebelum bayar ulang", async () => {
    // Regresi BUGHUNT round2 residual: klon baris dulu membuang
    // commissionPayableId/commissionInvoiceId — slip koreksi tak menaut
    // bayar, utang komisi yatim. Salinan verbatim pun mustahil:
    // commissionPayableId @unique (satu payable satu baris slip).
    componentLinesByPayroll = new Map([
      [1, [{
        id: 41, payrollId: 1, componentId: 9,
        componentNameSnapshot: "Komisi Penjualan", kindSnapshot: "earning",
        recurrenceSnapshot: "variable", isTaxableSnapshot: true,
        source: "commission", assignmentId: null, accountIdSnapshot: 210212,
        amount: 250000, pkwtEventId: null, pkwtSettledViaAccrual: null,
        commissionPayableId: 101, commissionInvoiceId: 5001,
      }]],
    ])
    commissionPayableById = new Map([
      [101, { id: 101, salesInvoiceId: 5001, salesEmployeeId: 9, accruedAmount: 700000, reversalAmount: 0, paidAmount: 250000 }],
    ])

    const res = await correctPaidPayroll(1, fd("Koreksi slip berkomisi"))
    expect(res.success).toBe(true)

    // Baris koreksi (slip 2) membawa kedua tautan; baris asal dilepas.
    const correctionLines = componentLinesByPayroll.get(2) ?? []
    expect(correctionLines).toHaveLength(1)
    expect(correctionLines[0].commissionPayableId).toBe(101)
    expect(correctionLines[0].commissionInvoiceId).toBe(5001)
    expect(componentLinesByPayroll.get(1)![0].commissionPayableId).toBeNull()
    // Snapshot faktur baris asal utuh sebagai jejak historis.
    expect(componentLinesByPayroll.get(1)![0].commissionInvoiceId).toBe(5001)

    // paidAmount dilepas sebesar porsi slip asal SEBELUM onPayrollPaid
    // koreksi (yang membayar ulang lewat paidByIdTx di hook nyata):
    // tanpa pelepasan, bayar ulang selalu "melebihi sisa".
    expect(commissionPayableUpdates).toEqual([{ id: 101, paidAmount: 0 }])
    expect(onPayrollPaidMock).toHaveBeenCalledTimes(1)
    expect(onPayrollPaidMock.mock.calls[0][0]).toBe(2)
  })

  it("komisi: pelepasan melebihi paidAmount tercatat ditolak, nol slip koreksi", async () => {
    componentLinesByPayroll = new Map([
      [1, [{
        id: 41, payrollId: 1, componentId: 9,
        componentNameSnapshot: "Komisi Penjualan", kindSnapshot: "earning",
        recurrenceSnapshot: "variable", isTaxableSnapshot: true,
        source: "commission", assignmentId: null, accountIdSnapshot: 210212,
        amount: 250000, pkwtEventId: null, pkwtSettledViaAccrual: null,
        commissionPayableId: 101, commissionInvoiceId: 5001,
      }]],
    ])
    commissionPayableById = new Map([
      [101, { id: 101, salesInvoiceId: 5001, salesEmployeeId: 9, accruedAmount: 700000, reversalAmount: 0, paidAmount: 100000 }],
    ])
    const res = await correctPaidPayroll(1, fd("Koreksi slip berkomisi rusak"))
    expect(res.success).toBe(false)
    expect(res.error).toContain("Pelepasan bayar komisi ditolak")
    expect(commissionPayableUpdates).toEqual([])
    expect(onPayrollPaidMock).not.toHaveBeenCalled()
  })

  it("BR-HRCR-10: slip sumber PKWT paid menahan koreksi dengan menyebut penahan", async () => {
    pkwtBlocking = { id: 55, status: "paid" }
    const res = await correctPaidPayroll(1, fd("koreksi slip PKWT"))
    expect(res.success).toBe(false)
    expect(res.error).toContain("55")
    expect(reverseJournalsMock).not.toHaveBeenCalled()
  })
})
