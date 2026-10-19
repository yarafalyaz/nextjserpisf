import { describe, it, expect, vi, beforeEach } from "vitest"

// Guard R-09: tutup/buka periode harus SATU $transaction yang mengunci
// baris system_settings (FOR UPDATE) dulu, membaca ulang, memvalidasi,
// lalu update di tx yang sama. Tanpa itu, cek "jangan turunkan kunci" /
// "belum dikunci" dan update bisa disela penulis jurnal/bank atau
// tutup-periode lain (TOCTOU).
//
// Falsifikasi: ganti locking read dengan findFirst biasa (tanpa FOR
// UPDATE) atau keluarkan update dari $transaction -> tes urutan merah.

const mocks = vi.hoisted(() => {
  const order: string[] = []
  const queryRaw = vi.fn(async (strings: unknown) => {
    const sql = (strings as unknown as string[]).join(" ")
    order.push(`lock:${sql}`)
    return [{ id: 7, period_lock_date: null as Date | null }]
  })
  const update = vi.fn(async () => {
    order.push("update")
    return { id: 7 }
  })
  const tx: Record<string, unknown> = {}
  const prismaMock: Record<string, unknown> = {
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    systemSetting: {
      findFirst: vi.fn(async () => ({ id: 7, periodLockDate: null })),
      update,
    },
  }
  tx.$queryRaw = queryRaw
  tx.systemSetting = prismaMock.systemSetting
  return {
    order,
    queryRaw,
    update,
    tx,
    prismaMock,
    requirePermissionMock: vi.fn(),
    logActivityMock: vi.fn(),
    revalidateMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a),
}))

import { closeAccountingPeriod, reopenAccountingPeriod } from "../period-close.actions"

function fdDate(date: string): FormData {
  const f = new FormData()
  f.append("date", date)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.length = 0
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.logActivityMock.mockResolvedValue(undefined)
  ;(mocks.prismaMock.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (cb: (t: typeof mocks.tx) => unknown) => cb(mocks.tx),
  )
  mocks.queryRaw.mockImplementation(async (strings: unknown) => {
    const sql = (strings as unknown as string[]).join(" ")
    mocks.order.push(`lock:${sql}`)
    return [{ id: 7, period_lock_date: null }]
  })
  mocks.update.mockImplementation(async () => {
    mocks.order.push("update")
    return { id: 7 }
  })
})

function expectSettingLockBeforeUpdate() {
  expect(mocks.queryRaw).toHaveBeenCalledTimes(1)
  const sql = mocks.order[0] ?? ""
  expect(sql).toContain("FROM system_settings")
  expect(sql).toContain("period_lock_date")
  expect(sql).toContain("ORDER BY id")
  expect(sql).toContain("LIMIT 1")
  expect(sql).toContain("FOR UPDATE")
  // Jalur sukses: update tepat sesudah lock. Jalur validasi-gagal sah
  // tanpa update — pemanggil memeriksa order[1] sendiri bila menolak.
  // Baca lama di luar tx tidak boleh jadi dasar keputusan.
  expect(
    (mocks.prismaMock.systemSetting as { findFirst: ReturnType<typeof vi.fn> }).findFirst,
  ).not.toHaveBeenCalled()
}

describe("R-09 period-close: satu transaksi + kunci baris setting", () => {
  it("close: $transaction -> lock setting FOR UPDATE -> update di tx sama", async () => {
    const res = await closeAccountingPeriod(fdDate("2026-05-31"))

    expect(res).toEqual({
      success: true,
      message: expect.stringContaining("Periode dikunci sampai"),
    })
    expect(mocks.prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expectSettingLockBeforeUpdate()
    expect(mocks.order[1]).toBe("update")
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { periodLockDate: expect.any(Date) },
    })
  })

  it("close: menolak menurunkan kunci yang dibaca ulang sesudah lock", async () => {
    mocks.queryRaw.mockImplementation(async (strings: unknown) => {
      const sql = (strings as unknown as string[]).join(" ")
      mocks.order.push(`lock:${sql}`)
      return [{ id: 7, period_lock_date: new Date("2026-06-30T23:59:59") }]
    })

    const res = await closeAccountingPeriod(fdDate("2026-05-31"))

    expect(res.success).toBe(false)
    expect(res.error).toContain("Periode sudah dikunci sampai")
    expectSettingLockBeforeUpdate()
    expect(mocks.order).not.toContain("update")
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("close: tanpa baris setting -> gagal di dalam tx, tanpa update", async () => {
    mocks.queryRaw.mockImplementation(async (strings: unknown) => {
      const sql = (strings as unknown as string[]).join(" ")
      mocks.order.push(`lock:${sql}`)
      return []
    })

    const res = await closeAccountingPeriod(fdDate("2026-05-31"))

    expect(res).toEqual({ success: false, error: "Pengaturan sistem tidak ditemukan." })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("reopen: $transaction -> lock setting FOR UPDATE -> update null di tx sama", async () => {
    mocks.queryRaw.mockImplementation(async (strings: unknown) => {
      const sql = (strings as unknown as string[]).join(" ")
      mocks.order.push(`lock:${sql}`)
      return [{ id: 7, period_lock_date: new Date("2026-05-31T23:59:59") }]
    })

    const res = await reopenAccountingPeriod()

    expect(res).toEqual({ success: true, message: "Kunci periode dibuka." })
    expect(mocks.prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expectSettingLockBeforeUpdate()
    expect(mocks.order[1]).toBe("update")
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { periodLockDate: null },
    })
  })

  it("reopen: menolak bila kunci (dibaca ulang sesudah lock) sudah kosong", async () => {
    mocks.queryRaw.mockImplementation(async (strings: unknown) => {
    const sql = (strings as unknown as string[]).join(" ")
    mocks.order.push(`lock:${sql}`)
    return [{ id: 7, period_lock_date: null }]
  })

    const res = await reopenAccountingPeriod()

    expect(res).toEqual({ success: false, error: "Periode belum dikunci." })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
