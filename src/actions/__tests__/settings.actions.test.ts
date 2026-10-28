import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateMock: vi.fn(),
  logActivityMock: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { systemSetting: { findFirst: mocks.findFirstMock, update: mocks.updateMock } },
}))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: any) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
  }),
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))

import { updateSystemSettings } from "../settings.actions"

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.findFirstMock.mockResolvedValue({ id: 9 })
  mocks.updateMock.mockResolvedValue({})
})

describe("updateSystemSettings validasi Zod field tertulis", () => {
  it("menolak companyLogoDark > 500 char, tanpa update DB", async () => {
    await expect(
      updateSystemSettings(fd({ companyLogoDark: "x".repeat(501) })),
    ).rejects.toThrow(/Validasi gagal: companyLogoDark/)
    expect(mocks.updateMock).not.toHaveBeenCalled()
  })

  it("menolak depreciationExpenseAccountId non-bilangan, tanpa update DB", async () => {
    await expect(
      updateSystemSettings(fd({ depreciationExpenseAccountId: "abc" })),
    ).rejects.toThrow(/Validasi gagal: depreciationExpenseAccountId/)
    expect(mocks.updateMock).not.toHaveBeenCalled()
  })

  it("happy path: 3 field baru tersimpan, redirect jalan", async () => {
    await expect(
      updateSystemSettings(
        fd({
          companyLogoDark: "/logo-dark.png",
          depreciationExpenseAccountId: "12",
          accumulatedDepreciationAccountId: "13",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT")
    const data = mocks.updateMock.mock.calls.at(-1)![0].data
    expect(data.companyLogoDark).toBe("/logo-dark.png")
    expect(data.depreciationExpenseAccountId).toBe(12)
    expect(data.accumulatedDepreciationAccountId).toBe(13)
  })

  it("kosong = null utk accountId/logo-dark (clear field tetap bisa)", async () => {
    await expect(
      updateSystemSettings(
        fd({ companyLogoDark: "", depreciationExpenseAccountId: "", accumulatedDepreciationAccountId: "" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT")
    const data = mocks.updateMock.mock.calls.at(-1)![0].data
    expect(data.companyLogoDark).toBeNull()
    expect(data.depreciationExpenseAccountId).toBeNull()
    expect(data.accumulatedDepreciationAccountId).toBeNull()
  })
})

// F-2026-10-25-015-V: gerbang server pkp-tanpa-tanggal di updateSystemSettings.
// Guard bisa tercabut diam-diam tanpa tes merah sebelum blok ini ada
// (audit Accountant t_808c999d pasca-merge PR #861).
describe("updateSystemSettings gerbang PKP tanpa tanggal (F-2026-10-25-015-V)", () => {
  const PESAN_PKP_TANPA_TANGGAL =
    "Status PKP perusahaan = PKP wajib disertai tanggal mulai kewajiban PKP. Isi tanggal mulai kewajiban (bukan tanggal SPPKP) sebelum menyimpan."

  it("(a) status pkp dari form + settings tersimpan tanpa tanggal -> ditolak verbatim, tanpa update DB", async () => {
    // settings default mock { id: 9 } tanpa companyPkpEffectiveFrom.
    await expect(updateSystemSettings(fd({ companyPkpStatus: "pkp" }))).rejects.toThrow(
      PESAN_PKP_TANPA_TANGGAL,
    )
    expect(mocks.updateMock).not.toHaveBeenCalled()
  })

  it("(b) status pkp + tanggal dari form -> lolos, update dipanggil dengan tanggal", async () => {
    await expect(
      updateSystemSettings(fd({ companyPkpStatus: "pkp", companyPkpEffectiveFrom: "2025-01-01" })),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.updateMock).toHaveBeenCalledTimes(1)
    const data = mocks.updateMock.mock.calls.at(-1)![0].data
    expect(data.companyPkpStatus).toBe("pkp")
    expect(data.companyPkpEffectiveFrom).toBeInstanceOf(Date)
    expect(data.companyPkpEffectiveFrom.getFullYear()).toBe(2025)
  })

  it("(c) status pkp dari form + tanggal hanya dari settings tersimpan -> lolos", async () => {
    mocks.findFirstMock.mockResolvedValue({
      id: 9,
      companyPkpStatus: "pkp",
      companyPkpEffectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
    })
    await expect(updateSystemSettings(fd({ companyPkpStatus: "pkp" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    )
    expect(mocks.updateMock).toHaveBeenCalledTimes(1)
  })
})

// t_de3aba0b (temuan QA 28 Okt 2026): lima mapping akun yang dibaca jalur uang
// fail-closed sebelumnya TIDAK ada di whitelist aksi, sehingga setelah
// instalasi tidak bisa diisi/diubah sama sekali. Blok ini mengunci dua sisi:
// whitelist aksi (nilai benar-benar masuk payload update) dan registrasi Zod
// (nilai non-bilangan ditolak, bukan dibuang diam-diam).
describe("updateSystemSettings lima mapping akun fail-closed (t_de3aba0b)", () => {
  const LIMA_MAPPING = {
    customerDownPaymentAccountId: "210102",
    warrantyExpenseAccountId: "510104",
    warrantyProvisionAccountId: "210205",
    supplierClaimReceivableAccountId: "110508",
    reimbursementLiabilityAccountId: "210209",
  } as const

  it("menerima kelima mapping sebagai integer dan menyimpannya ke payload update", async () => {
    await expect(updateSystemSettings(fd({ ...LIMA_MAPPING }))).rejects.toThrow("NEXT_REDIRECT")
    const data = mocks.updateMock.mock.calls.at(-1)![0].data
    for (const [key, value] of Object.entries(LIMA_MAPPING)) {
      expect(data[key], `${key} harus tersimpan sebagai angka`).toBe(Number(value))
    }
  })

  it("mapping yang tidak dikirim form tidak ikut ditulis (kolom hasil instalasi utuh)", async () => {
    // Form lama / seksi lain hanya mengirim satu field: empat kolom lain tidak
    // boleh muncul di payload sebagai undefined-eksplisit, karena `undefined`
    // berarti "jangan sentuh" bagi Prisma — sedangkan `null` akan menghapus.
    await expect(
      updateSystemSettings(fd({ warrantyExpenseAccountId: "510104" })),
    ).rejects.toThrow("NEXT_REDIRECT")
    const data = mocks.updateMock.mock.calls.at(-1)![0].data
    expect(data.warrantyExpenseAccountId).toBe(510104)
    for (const key of [
      "customerDownPaymentAccountId",
      "warrantyProvisionAccountId",
      "supplierClaimReceivableAccountId",
      "reimbursementLiabilityAccountId",
    ]) {
      expect(data[key], `${key} tidak boleh ditulis saat field absen`).toBeUndefined()
      expect(key in data, `${key} harus tetap ada sebagai kunci undefined`).toBe(true)
    }
  })

  it("string kosong = null (mapping bisa dikosongkan dengan sengaja)", async () => {
    await expect(
      updateSystemSettings(
        fd({
          customerDownPaymentAccountId: "",
          warrantyExpenseAccountId: "",
          warrantyProvisionAccountId: "",
          supplierClaimReceivableAccountId: "",
          reimbursementLiabilityAccountId: "",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT")
    const data = mocks.updateMock.mock.calls.at(-1)![0].data
    for (const key of Object.keys(LIMA_MAPPING)) {
      expect(data[key], `${key} harus null saat dikosongkan`).toBeNull()
    }
  })

  it("nilai non-bilangan ditolak validasi Zod tanpa menyentuh DB", async () => {
    await expect(
      updateSystemSettings(fd({ supplierClaimReceivableAccountId: "piutang" })),
    ).rejects.toThrow(/Validasi gagal: supplierClaimReceivableAccountId/)
    expect(mocks.updateMock).not.toHaveBeenCalled()
  })
})

// t_358490e9: kartu menuntut bukti nilai BENAR-BENAR TERSIMPAN, bukan hanya
// payload terbentuk. Mock update di bawah meniru semantik Prisma pada satu baris
// penyimpanan: kunci `undefined` tidak menyentuh kolom, `null` mengosongkan,
// angka menimpa. Baris awal = hasil `resolveAllAccountMappings` saat instalasi
// (`src/lib/setup/install.ts:135-140`), sehingga tes sekaligus membuktikan
// kolom hasil instalasi tidak tertimpa saat form tidak mengirimnya.
describe("updateSystemSettings lima mapping akun — baca-balik penyimpanan (t_358490e9)", () => {
  const KOLOM_MAPPING = [
    "customerDownPaymentAccountId",
    "warrantyExpenseAccountId",
    "warrantyProvisionAccountId",
    "supplierClaimReceivableAccountId",
    "reimbursementLiabilityAccountId",
  ] as const

  type BarisSetting = Record<string, unknown>
  let baris: BarisSetting

  beforeEach(() => {
    baris = {
      id: 9,
      customerDownPaymentAccountId: 21,
      warrantyExpenseAccountId: 51,
      warrantyProvisionAccountId: 22,
      supplierClaimReceivableAccountId: 11,
      reimbursementLiabilityAccountId: 23,
    }
    mocks.updateMock.mockImplementation(
      async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        expect(where).toEqual({ id: 9 })
        for (const [kunci, nilai] of Object.entries(data)) {
          if (nilai === undefined) continue
          baris[kunci] = nilai
        }
        return baris
      },
    )
  })

  it("kelima nilai yang dikirim form terbaca kembali dari baris tersimpan sebagai angka", async () => {
    // id akun = id numerik COA; sengaja berbeda dari nilai instalasi supaya
    // penimpaan benar-benar terlihat.
    const idCoa = {
      customerDownPaymentAccountId: "101",
      warrantyExpenseAccountId: "102",
      warrantyProvisionAccountId: "103",
      supplierClaimReceivableAccountId: "104",
      reimbursementLiabilityAccountId: "105",
    }
    await expect(updateSystemSettings(fd(idCoa))).rejects.toThrow("NEXT_REDIRECT")

    for (const [kunci, nilai] of Object.entries(idCoa)) {
      expect(baris[kunci], `${kunci} harus terbaca kembali dari penyimpanan`).toBe(Number(nilai))
      expect(typeof baris[kunci], `${kunci} harus tersimpan sebagai angka`).toBe("number")
    }
  })

  it("form yang hanya mengirim satu kunci tidak merusak empat kunci hasil instalasi", async () => {
    await expect(
      updateSystemSettings(fd({ warrantyProvisionAccountId: "207" })),
    ).rejects.toThrow("NEXT_REDIRECT")

    expect(baris.warrantyProvisionAccountId, "kunci yang dikirim harus berubah").toBe(207)
    expect(baris.customerDownPaymentAccountId, "nilai instalasi DP harus utuh").toBe(21)
    expect(baris.warrantyExpenseAccountId, "nilai instalasi beban garansi harus utuh").toBe(51)
    expect(baris.supplierClaimReceivableAccountId, "nilai instalasi piutang klaim harus utuh").toBe(11)
    expect(baris.reimbursementLiabilityAccountId, "nilai instalasi utang reimbursement harus utuh").toBe(23)
  })

  it("pengosongan sengaja (string kosong) terbaca sebagai null di penyimpanan", async () => {
    await expect(
      updateSystemSettings(
        fd({
          customerDownPaymentAccountId: "",
          warrantyExpenseAccountId: "",
          warrantyProvisionAccountId: "",
          supplierClaimReceivableAccountId: "",
          reimbursementLiabilityAccountId: "",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT")

    for (const kunci of KOLOM_MAPPING) {
      expect(baris[kunci], `${kunci} harus terbaca null setelah dikosongkan`).toBeNull()
    }
  })
})
