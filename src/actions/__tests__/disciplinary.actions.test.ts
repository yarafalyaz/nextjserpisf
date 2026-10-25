import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Aksi disiplin F-2026-10-25-005-S DISC-B1: penjaga server (izin khusus
 * Q-DISC-2, scope HR, SoD Employee, jenjang turunan dihitung ulang dalam
 * transaksi, jendela tanggapan Q-DISC-3, rekod pembatal BR-DISC-10) di
 * atas builder murni disciplinary.ts. Prisma + auth di-mock; logika
 * penjaga NYATA.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  recFindUnique: vi.fn(),
  recFindMany: vi.fn(),
  recCreate: vi.fn(),
  recUpdateMany: vi.fn(),
  transaction: vi.fn(),
  logActivity: vi.fn(),
  generateDocumentNumber: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("@/lib/auth/hr-scope", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/hr-scope")>()
  return { ...original, getHrScope: mocks.getHrScope }
})
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivity }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employeeFindUnique, findFirst: mocks.employeeFindFirst },
    employeeDisciplinaryRecord: {
      findUnique: mocks.recFindUnique,
      findMany: mocks.recFindMany,
      create: mocks.recCreate,
      updateMany: mocks.recUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}))

import {
  acknowledgeDisciplinaryRecord,
  approveDisciplinaryRecord,
  createDisciplinaryRecord,
  recordLateDisciplinaryResponse,
  rejectDisciplinaryRecord,
  respondDisciplinaryRecord,
  submitDisciplinaryRecord,
  voidDisciplinaryRecord,
} from "../disciplinary.actions"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const user = { id: "10", roles: ["ga"] }

function recordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    employeeId: 1,
    level: "sp1",
    violationCategory: "mangkir tanpa keterangan berulang",
    violationDate: d("2026-01-05"),
    description: "Mangkir 3 hari",
    workflowStatus: "draft",
    requestedBy: 7,
    approvedBy: null,
    secondApprovedBy: null,
    issuedAt: null,
    deletedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(user)
  mocks.getHrScope.mockResolvedValue({ kind: "all" })
  mocks.logActivity.mockResolvedValue(undefined)
  mocks.employeeFindFirst.mockResolvedValue({ id: 99 }) // pemanggil = Employee 99
  mocks.employeeFindUnique.mockResolvedValue({ id: 1, deletedAt: null })
  mocks.recFindMany.mockResolvedValue([])
  mocks.recCreate.mockResolvedValue({ id: 5 })
  mocks.recUpdateMany.mockResolvedValue({ count: 1 })
  mocks.generateDocumentNumber.mockResolvedValue("001/SP/YRA/01/2026")
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      employeeDisciplinaryRecord: {
        findMany: mocks.recFindMany,
        findUnique: mocks.recFindUnique,
        create: mocks.recCreate,
        updateMany: mocks.recUpdateMany,
      },
    }),
  )
})

describe("createDisciplinaryRecord", () => {
  it("AC-DISC-9: kategori di luar daftar resmi Q-DISC-1 DITOLAK", async () => {
    const r = await createDisciplinaryRecord({
      employeeId: 1,
      level: "sp1",
      violationCategory: "kategori karangan bebas",
      violationDate: "2026-01-05",
      description: "Uraian",
      regulationReference: null,
    })
    expect(r.success).toBe(false)
    expect(mocks.recCreate).not.toHaveBeenCalled()
  })

  it("AC-DISC-9: SP pertama-dan-terakhir untuk kategori umum DITOLAK", async () => {
    const r = await createDisciplinaryRecord({
      employeeId: 1,
      level: "sp_first_final",
      violationCategory: "mangkir tanpa keterangan berulang",
      violationDate: "2026-01-05",
      description: "Uraian",
      regulationReference: null,
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/pelanggaran berat/)
    expect(mocks.recCreate).not.toHaveBeenCalled()
  })

  it("AC-DISC-9: SP pertama-dan-terakhir untuk kategori berat tersimpan draft", async () => {
    const r = await createDisciplinaryRecord({
      employeeId: 1,
      level: "sp_first_final",
      violationCategory: "pencurian/penggelapan aset perusahaan",
      violationDate: "2026-01-05",
      description: "Uraian",
      regulationReference: null,
    })
    expect(r).toEqual({ success: true })
    expect(mocks.recCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: "sp_first_final", workflowStatus: "draft", requestedBy: 99 }),
      }),
    )
  })

  it("AC-DISC-1: pengaju memilih sp3 manual tanpa SP aktif DITOLAK (jenjang turunan sp1)", async () => {
    const r = await createDisciplinaryRecord({
      employeeId: 1,
      level: "sp3",
      violationCategory: "mangkir tanpa keterangan berulang",
      violationDate: "2026-01-05",
      description: "Uraian",
      regulationReference: null,
    })
    expect(r.success).toBe(false)
    expect(mocks.recCreate).not.toHaveBeenCalled()
  })

  it("AC-DISC-5: scope self tidak dapat mengajukan untuk karyawan lain", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 99 })
    const r = await createDisciplinaryRecord({
      employeeId: 1,
      level: "sp1",
      violationCategory: "mangkir tanpa keterangan berulang",
      violationDate: "2026-01-05",
      description: "Uraian",
      regulationReference: null,
    })
    expect(r.success).toBe(false)
    expect(mocks.recCreate).not.toHaveBeenCalled()
  })
})

describe("approveDisciplinaryRecord", () => {
  it("AC-DISC-4: self-approve pengajuan sendiri DITOLAK", async () => {
    mocks.recFindUnique.mockResolvedValue(recordRow({ workflowStatus: "pending_approval" }))
    mocks.employeeFindFirst.mockResolvedValue({ id: 7 }) // pemanggil = pengaju
    const r = await approveDisciplinaryRecord(5)
    expect(r.success).toBe(false)
    expect(mocks.recUpdateMany).not.toHaveBeenCalled()
  })

  it("SP1 disetujui langsung terbit dengan nomor dokumen", async () => {
    mocks.recFindUnique.mockResolvedValue(recordRow({ workflowStatus: "pending_approval" }))
    const r = await approveDisciplinaryRecord(5)
    expect(r).toEqual({ success: true })
    expect(mocks.recUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowStatus: "issued",
          approvedBy: 99,
          documentNo: "001/SP/YRA/01/2026",
        }),
      }),
    )
  })

  it("AC-DISC-4: SP3 persetujuan pertama tetap pending; kedua = penyetuju pertama DITOLAK; kedua berbeda menerbitkan", async () => {
    mocks.recFindUnique.mockResolvedValue(
      recordRow({ level: "sp3", workflowStatus: "pending_approval" }),
    )
    expect(await approveDisciplinaryRecord(5)).toEqual({ success: true })
    expect(mocks.recUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { approvedBy: 99, approvedAt: expect.any(Date) } }),
    )

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(user)
    mocks.getHrScope.mockResolvedValue({ kind: "all" })
    mocks.employeeFindFirst.mockResolvedValue({ id: 99 })
    mocks.recFindUnique.mockResolvedValue(
      recordRow({ level: "sp3", workflowStatus: "pending_approval", approvedBy: 99 }),
    )
    const same = await approveDisciplinaryRecord(5)
    expect(same.success).toBe(false)
    if (!same.success) expect(same.error).toMatch(/penyetuju pertama/)

    mocks.employeeFindFirst.mockResolvedValue({ id: 42 })
    mocks.generateDocumentNumber.mockResolvedValue("001/SP/YRA/01/2026")
    mocks.recUpdateMany.mockResolvedValue({ count: 1 })
    // Rantai sah SP3: SP2 issued aktif pada violationDate rekod (2026-01-05).
    mocks.recFindMany.mockResolvedValue([
      {
        id: 4,
        employeeId: 1,
        level: "sp2",
        workflowStatus: "issued",
        violationDate: d("2025-12-01"),
        issuedAt: d("2025-12-01"),
        voidedAt: null,
      },
    ])
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        employeeDisciplinaryRecord: {
          findMany: mocks.recFindMany,
          findUnique: mocks.recFindUnique,
          create: mocks.recCreate,
          updateMany: mocks.recUpdateMany,
        },
      }),
    )
    expect(await approveDisciplinaryRecord(5)).toEqual({ success: true })
    expect(mocks.recUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workflowStatus: "issued", secondApprovedBy: 42 }),
      }),
    )
  })
})

describe("rejectDisciplinaryRecord", () => {
  it("AC-DISC-7: tolak tanpa alasan DITOLAK server", async () => {
    mocks.recFindUnique.mockResolvedValue(recordRow({ workflowStatus: "pending_approval" }))
    const r = await rejectDisciplinaryRecord(5, "  ")
    expect(r.success).toBe(false)
    expect(mocks.recUpdateMany).not.toHaveBeenCalled()
  })

  it("klaim kalah count-0: dua penolak bersamaan, klaim kedua gagal konflik tanpa ActivityLog", async () => {
    // Penjaga lolos (rekod masih pending_approval saat dibaca), tetapi
    // updateMany atomik kalah klaim (count 0 = penolak lain menang
    // lebih dulu) -> error konflik, bukan sukses diam-diam.
    mocks.recFindUnique.mockResolvedValue(recordRow({ workflowStatus: "pending_approval" }))
    mocks.recUpdateMany.mockResolvedValue({ count: 0 })
    const r = await rejectDisciplinaryRecord(5, "Bukti tidak cukup")
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error).toMatch(/hanya dapat ditolak dari status menunggu persetujuan/)
    }
    expect(mocks.recUpdateMany).toHaveBeenCalledTimes(1)
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })
})

describe("tanggapan karyawan (Q-DISC-3)", () => {
  it("AC-DISC-6: tanggapan untuk rekod karyawan lain DITOLAK", async () => {
    mocks.recFindUnique.mockResolvedValue(
      recordRow({ workflowStatus: "issued", issuedAt: new Date() }),
    )
    mocks.employeeFindFirst.mockResolvedValue({ id: 42 })
    const r = await respondDisciplinaryRecord(5, "Tanggapan saya")
    expect(r.success).toBe(false)
    expect(mocks.recUpdateMany).not.toHaveBeenCalled()
  })

  it("lewat jendela 7 hari kalender DITOLAK berisik; HR menempelkan berlabel terlambat", async () => {
    const old = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    mocks.recFindUnique.mockResolvedValue(
      recordRow({ employeeId: 99, workflowStatus: "issued", issuedAt: old }),
    )
    const r = await respondDisciplinaryRecord(5, "Tanggapan terlambat")
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/Jendela tanggapan 7 hari/)

    const hr = await recordLateDisciplinaryResponse(5, "Tanggapan terlambat")
    expect(hr).toEqual({ success: true })
    expect(mocks.recUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ employeeResponseLate: true }),
      }),
    )
  })

  it("dalam jendela: tanggapan terbitan hari ini tersimpan tidak terlambat", async () => {
    mocks.recFindUnique.mockResolvedValue(
      recordRow({ employeeId: 99, workflowStatus: "issued", issuedAt: new Date() }),
    )
    expect(await respondDisciplinaryRecord(5, "Saya menerima")).toEqual({ success: true })
    expect(mocks.recUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ employeeResponseLate: false }),
      }),
    )
  })
})

describe("voidDisciplinaryRecord (BR-DISC-10)", () => {
  it("AC-DISC-10: pembatalan menandai rekod asal + membuat rekod pembatal tertaut", async () => {
    mocks.recFindUnique.mockResolvedValue(
      recordRow({ workflowStatus: "issued", issuedAt: d("2026-01-05") }),
    )
    expect(await voidDisciplinaryRecord(5, "Salah tanggal kejadian")).toEqual({ success: true })
    expect(mocks.recUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ voidedBy: 99, voidReason: "Salah tanggal kejadian" }),
      }),
    )
    expect(mocks.recCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ voidOfId: 5, voidedAt: expect.any(Date) }),
      }),
    )
  })

  it("rekod belum issued tidak dapat dibatalkan", async () => {
    mocks.recFindUnique.mockResolvedValue(recordRow({ workflowStatus: "draft" }))
    const r = await voidDisciplinaryRecord(5, "Alasan")
    expect(r.success).toBe(false)
    expect(mocks.recCreate).not.toHaveBeenCalled()
  })
})

describe("submitDisciplinaryRecord & acknowledge", () => {
  it("submit hanya oleh pengaju dari draft", async () => {
    mocks.recFindUnique.mockResolvedValue(recordRow({ requestedBy: 42 }))
    const r = await submitDisciplinaryRecord(5)
    expect(r.success).toBe(false)
    expect(mocks.recUpdateMany).not.toHaveBeenCalled()
  })

  it("tanda terima menolak tanda tangan tercatat, SP tetap issued (BR-DISC-07)", async () => {
    mocks.recFindUnique.mockResolvedValue(
      recordRow({ workflowStatus: "issued", issuedAt: d("2026-01-05") }),
    )
    expect(await acknowledgeDisciplinaryRecord(5, "tatap muka", true)).toEqual({ success: true })
    expect(mocks.recUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acknowledgmentRefused: true }),
      }),
    )
  })
})
