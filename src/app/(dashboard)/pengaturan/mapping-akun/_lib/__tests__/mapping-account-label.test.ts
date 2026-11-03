import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { account: { findMany: mocks.accountFindMany } },
}))

import {
  isMappingFilled,
  MAPPING_INVALID,
  MAPPING_UNSET,
  mappingAccountLabel,
  usableMappingAccounts,
} from "@/app/(dashboard)/pengaturan/mapping-akun/_lib/mapping-account-label"
import { loadMappingAccounts } from "@/app/(dashboard)/pengaturan/mapping-akun/_lib/load-mapping-accounts"

/**
 * Putaran 103: layar ringkasan Mapping Akun sebelumnya memakai `{ isActive: true }`
 * saja, jadi mapping yang menunjuk akun induk atau akun terhapus lunak tetap
 * tampil hijau "tersambung" — padahal `journal.service` menolak memposting
 * keduanya. Tanda siap yang salah lebih buruk daripada tanda "belum diset".
 */

beforeEach(() => {
  vi.clearAllMocks()
  mocks.accountFindMany.mockResolvedValue([
    { id: 1, code: "1000", name: "Aset", _count: { children: 2 } },
    { id: 2, code: "1101", name: "Kas", _count: { children: 0 } },
  ])
})

describe("usableMappingAccounts", () => {
  it("membuang akun induk — hanya daun yang bisa diposting", () => {
    const rows = usableMappingAccounts([
      { id: 1, code: "1000", name: "Aset", _count: { children: 2 } },
      { id: 2, code: "1101", name: "Kas", _count: { children: 0 } },
      { id: 3, code: "1102", name: "Bank" },
    ])
    expect(rows).toEqual([
      { id: 2, code: "1101", name: "Kas" },
      { id: 3, code: "1102", name: "Bank" },
    ])
  })

  it("menerima akun tanpa muatan _count sebagai daun", () => {
    expect(usableMappingAccounts([{ id: 9, code: "9", name: "X" }])).toHaveLength(1)
  })
})

describe("mappingAccountLabel", () => {
  const accounts = [{ id: 2, code: "1101", name: "Kas" }]

  it("kosong = belum diset", () => {
    expect(mappingAccountLabel(null, accounts)).toBe(MAPPING_UNSET)
    expect(mappingAccountLabel(undefined, accounts)).toBe(MAPPING_UNSET)
    expect(mappingAccountLabel(0, accounts)).toBe(MAPPING_UNSET)
  })

  it("id yang akunnya tidak lolos definisi kanonis ditandai tidak valid, bukan hijau", () => {
    expect(mappingAccountLabel(1, accounts)).toBe(MAPPING_INVALID)
  })

  it("akun sah menyelesaikan label kode - nama", () => {
    expect(mappingAccountLabel(2, accounts)).toBe("1101 - Kas")
  })

  it("hanya label akun sah yang dihitung terisi", () => {
    expect(isMappingFilled(mappingAccountLabel(2, accounts))).toBe(true)
    expect(isMappingFilled(mappingAccountLabel(1, accounts))).toBe(false)
    expect(isMappingFilled(mappingAccountLabel(null, accounts))).toBe(false)
  })
})

describe("loadMappingAccounts", () => {
  it("memakai definisi kanonis load-settings: aktif, belum terhapus, leaf", async () => {
    const accounts = await loadMappingAccounts()
    expect(mocks.accountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, deletedAt: null } }),
    )
    expect(accounts).toEqual([{ id: 2, code: "1101", name: "Kas" }])
  })
})
