import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

// Putaran 100: Proyeksi Kas dulu membangun himpunan kas lokal dari
// cashBankAccountId + pettyCashAccountId + defaultCashAccountId, tanpa
// menyaring akun hidup — beda dari himpunan kanonis putaran 75
// (loadCashAccountIds: mapping ∪ reportGroup "BANK", ASSET aktif hidup)
// yang dipakai Arus Kas dan Buku Bank, jadi "Kas Saat Ini" bisa beda
// angka dari kedua laporan itu pada data yang sama.
const page = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/(dashboard)/laporan/proyeksi-kas/[[...segments]]/page.tsx",
  ),
  "utf8",
)

describe("himpunan kas Proyeksi Kas (putaran 100)", () => {
  it("memakai himpunan kas/bank kanonis bersama", () => {
    expect(page).toContain("from '@/lib/reports/ledger-cash-data'")
    expect(page).toContain("await loadCashAccountIds()")
  })

  it("tidak lagi membangun himpunan lokal dari settings termasuk defaultCashAccountId", () => {
    expect(page).not.toContain("settings.defaultCashAccountId")
    expect(page).not.toContain("getSystemSettings()")
  })
})
