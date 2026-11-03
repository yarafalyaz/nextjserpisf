import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Putaran 104: picker akun formulir keuangan wajib definisi kanonis yang sama
 * dengan `journal.service`/`assertAccountsExist` — aktif, belum dihapus, dan
 * **daun**. Sebelumnya 15 halaman hanya menyaring `isActive: true`, sehingga
 * akun induk (18 dari 128 akun di DB dev, mis. "1101 Kas & Bank") tampil di
 * dropdown dan transaksi baru gagal di posting dengan "Akun induk tidak bisa
 * diposting".
 */

const mocks = vi.hoisted(() => ({ accountFindMany: vi.fn() }))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { account: { findMany: mocks.accountFindMany } },
}))

import { loadPostableAccounts } from "@/lib/finance/postable-accounts"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.accountFindMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    "id" in args.where
      ? [{ id: 1, code: "1101", name: "Kas & Bank", type: "ASSET" }]
      : [{ id: 2, code: "110101", name: "Kas Kecil", type: "ASSET" }],
  )
})

describe("loadPostableAccounts", () => {
  it("hanya menawarkan akun daun yang hidup", async () => {
    const rows = await loadPostableAccounts()

    expect(rows).toEqual([{ id: 2, code: "110101", name: "Kas Kecil", type: "ASSET" }])
    expect(mocks.accountFindMany.mock.calls[0][0]).toMatchObject({
      where: { isActive: true, deletedAt: null, children: { none: {} } },
      orderBy: { code: "asc" },
    })
  })

  it("meneruskan saringan tipe dan kelompok laporan ke query", async () => {
    await loadPostableAccounts({ type: "EXPENSE", reportGroup: "EXPS" })

    expect(mocks.accountFindMany.mock.calls[0][0].where).toMatchObject({
      isActive: true,
      deletedAt: null,
      children: { none: {} },
      type: "EXPENSE",
      reportGroup: "EXPS",
    })
  })

  it("includeIds menyelamatkan akun tersimpan yang kini induk, tanpa duplikat", async () => {
    const rows = await loadPostableAccounts({ includeIds: [1, 2, null, undefined] })

    // 1 = induk tersimpan (tetap tampil), 2 = daun; 1 tidak muncul dua kali.
    expect(rows.map((row) => row.id)).toEqual([2, 1])
    expect(mocks.accountFindMany.mock.calls[1][0]).toMatchObject({
      where: { id: { in: [1, 2] }, isActive: true, deletedAt: null },
    })
  })

  it("tanpa includeIds tidak ada query akun kedua", async () => {
    await loadPostableAccounts()

    expect(mocks.accountFindMany).toHaveBeenCalledTimes(1)
  })
})
