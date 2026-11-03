import { prisma } from "@/lib/db/prisma"

/**
 * Akun yang boleh ditawarkan picker formulir yang bermuara ke jurnal.
 *
 * Definisi kanonis yang sama dengan picker `pengaturan/ubah/_lib/load-settings.ts`
 * (putaran 94) dan `mapping-akun/_lib/load-mapping-accounts.ts` (putaran 103):
 * aktif, belum dihapus lunak, dan **daun** (tanpa anak). `journal.service` dan
 * `assertAccountsExist` menolak akun induk saat posting, jadi picker yang
 * menawarkan induk menjanjikan penyimpanan yang pasti gagal di jurnal —
 * putaran 104 menemukan 18 akun induk di DB dev masih ditawarkan oleh 15
 * halaman formulir keuangan/aset/PPh.
 *
 * Akun yang sudah tersimpan pada dokumen lama bisa jadi induk (admin menambah
 * anak di bawahnya). Picker halaman UBAH mengirim `includeIds` berisi akun yang
 * sedang tersimpan supaya nilai lama tetap tampil apa adanya — operator melihat
 * yang tercatat, dan action tetap menolak menyimpannya sampai akun diganti.
 */
export interface PostableAccount {
  id: number
  code: string
  name: string
  type: string
}

export interface PostableAccountFilter {
  /** Saring tipe akun (mis. hanya ASSET untuk rekening kas/bank). */
  type?: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE"
  /** Saring kelompok laporan (mis. "BANK" untuk rekening kas/bank). */
  reportGroup?: string
  /**
   * Akun yang wajib tetap tampil walau bukan daun — dipakai halaman ubah
   * supaya nilai tersimpan tidak diam-diam berganti ke opsi pertama.
   */
  includeIds?: readonly (number | null | undefined)[]
}

export async function loadPostableAccounts(
  filter: PostableAccountFilter = {},
): Promise<PostableAccount[]> {
  const extraIds = [...new Set((filter.includeIds ?? []).filter((id): id is number => typeof id === "number" && id > 0))]
  const baseWhere = {
    isActive: true,
    deletedAt: null,
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.reportGroup ? { reportGroup: filter.reportGroup } : {}),
  }

  const [postable, extra] = await Promise.all([
    prisma.account.findMany({
      where: { ...baseWhere, children: { none: {} } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
    extraIds.length
      ? prisma.account.findMany({
          where: { id: { in: extraIds }, isActive: true, deletedAt: null },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true, type: true },
        })
      : Promise.resolve([]),
  ])

  const seen = new Set(postable.map((row) => row.id))
  return [...postable, ...extra.filter((row) => !seen.has(row.id))]
}
