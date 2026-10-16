import { describe, expect, it } from "vitest"

import { ACCOUNT_GROUP_LABELS, accountGroupLabel } from "../account-groups"
import { ACCURATE_TYPE_TO_ACCOUNT_TYPE } from "@/lib/setup/base-data"

/**
 * Kode tipe Accurate (`AREC`, `OCAS`, `EXPS`, …) pernah ditampilkan mentah di bagan akun
 * sehingga tidak terbaca. Tes ini memastikan SETIAP tipe yang dipakai COA punya label
 * Indonesia — menambah tipe baru tanpa label akan langsung gagal di sini.
 */
describe("label grup akun", () => {
  it("mencakup seluruh tipe akun Accurate yang dipakai COA", () => {
    const missing = Object.keys(ACCURATE_TYPE_TO_ACCOUNT_TYPE).filter(
      (type) => !ACCOUNT_GROUP_LABELS[type as keyof typeof ACCOUNT_GROUP_LABELS],
    )
    expect(missing).toEqual([])
  })

  it("memakai istilah Indonesia, bukan kode singkatan", () => {
    for (const [code, label] of Object.entries(ACCOUNT_GROUP_LABELS)) {
      expect(label, code).not.toBe(code)
      expect(label).toMatch(/^[A-Za-z&. ]+$/)
    }
  })

  it("menerjemahkan kode yang tampil di bagan akun", () => {
    expect(accountGroupLabel("BANK")).toBe("Kas & Bank")
    expect(accountGroupLabel("AREC")).toBe("Piutang Usaha")
    expect(accountGroupLabel("OCAS")).toBe("Aset Lancar Lainnya")
    expect(accountGroupLabel("DEPR")).toBe("Akumulasi Penyusutan")
    expect(accountGroupLabel("COGS")).toBe("Beban Pokok Penjualan")
    expect(accountGroupLabel("EXPS")).toBe("Beban Operasional")
    expect(accountGroupLabel("OINC")).toBe("Pendapatan Non Operasional")
  })

  it("aman untuk nilai kosong / tak dikenal", () => {
    expect(accountGroupLabel(null)).toBeNull()
    expect(accountGroupLabel(undefined)).toBeNull()
    expect(accountGroupLabel("")).toBeNull()
    expect(accountGroupLabel("XYZ")).toBeNull()
  })
})
