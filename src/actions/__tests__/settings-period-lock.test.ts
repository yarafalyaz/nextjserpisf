import { describe, it, expect, vi, beforeEach } from "vitest"

// Guard R-09: update pengaturan umum TIDAK boleh menulis
// `periodLockDate`. Kunci periode hanya berubah lewat proses akhir
// bulan (period-close.actions.ts: close/reopen, tercatat di log
// aktivitas + kunci baris setting FOR UPDATE). Sebelum guard ini,
// field itu ikut update lewat `dateNull("periodLockDate")` di
// settings.actions.ts — admin bisa memundurkan / membuka kunci
// periode dari form pengaturan biasa tanpa log khusus.
//
// Falsifikasi: kembalikan `periodLockDate: dateNull("periodLockDate")`
// ke data update di settings.actions.ts -> payload di bawah merah.
// Form edit menampilkan field itu read-only dengan name lain
// (periodLockDateDisplay), jadi FormData form pun tidak mengirimnya;
// tes pertama juga menyertakan periodLockDate di FormData untuk
// membuktikan jalur action sendiri menolak menulisnya.

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  findFirst: vi.fn(),
  requirePermissionMock: vi.fn(),
  logActivityMock: vi.fn(),
  revalidateMock: vi.fn(),
  redirectMock: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: {
      findFirst: (...a: unknown[]) => mocks.findFirst(...a),
      update: (...a: unknown[]) => mocks.update(...a),
    },
  },
}))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a),
}))
vi.mock("next/navigation", () => ({
  redirect: (...a: unknown[]) => mocks.redirectMock(...a),
}))

import { updateSystemSettings } from "../settings.actions"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.logActivityMock.mockResolvedValue(undefined)
  mocks.findFirst.mockResolvedValue({ id: 7 })
  mocks.update.mockResolvedValue({ id: 7 })
})

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

describe("R-09 settings umum: periodLockDate tidak ikut update", () => {
  it("periodLockDate di FormData diabaikan; field lain tetap ter-update", async () => {
    await updateSystemSettings(
      form({
        companyName: "Bengkel Maju",
        currencyCode: "IDR",
        periodLockDate: "2020-01-31",
        _redirectTo: "/pengaturan",
      }),
    )

    expect(mocks.update).toHaveBeenCalledTimes(1)
    const data = mocks.update.mock.calls[0][0].data as Record<string, unknown>
    expect(data).not.toHaveProperty("periodLockDate")
    // Update field lain tidak rusak.
    expect(data.companyName).toBe("Bengkel Maju")
    expect(data.currencyCode).toBe("IDR")
    expect(mocks.update.mock.calls[0][0].where).toEqual({ id: 7 })
  })

  it("periodLockDate kosong (upaya membuka kunci) juga tidak menulis apa-apa", async () => {
    await updateSystemSettings(
      form({ companyName: "Bengkel Maju", periodLockDate: "" }),
    )

    expect(mocks.update).toHaveBeenCalledTimes(1)
    const data = mocks.update.mock.calls[0][0].data as Record<string, unknown>
    expect(data).not.toHaveProperty("periodLockDate")
  })
})
