import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Penjaga cakupan otorisasi: SETIAP server action (`"use server"`) harus memanggil
 * minimal satu guard izin di badannya sendiri.
 *
 * Kenapa perlu: saat mengaudit RBAC, ditemukan action penerimaan barang yang menerima
 * `warehouseId` dari pengguna tanpa cek scope, dan lubang semacam itu lolos karena
 * tidak ada tes yang memastikan "action baru wajib punya guard". Skrip hitung manual
 * (317 dari 319) tidak pernah dijalankan otomatis — tes ini yang menjalankannya.
 *
 * Cara kerja: pecah tiap file `src/actions/*.actions.ts` per `export async function`,
 * lalu periksa badannya mengandung salah satu guard. Guard scope gudang/HR
 * (`assertWarehouseAccess`) sengaja TIDAK dihitung — scope bukan pengganti izin,
 * keduanya harus ada.
 */

const ACTIONS_DIR = path.join(process.cwd(), "src/actions")

/** Guard izin yang diterima, termasuk pola khusus yang sudah ada di repo. */
const GUARD_PATTERN =
  /(require|has)(Permission|AnyPermission|Role|Auth)\(|assert(ApprovalPermission|StepApprover|CSRF)\(/

/**
 * Pengecualian yang disengaja. Setiap entri wajib punya alasan; menghapus guard dari
 * action lain akan menggagalkan tes, begitu pula menambah pengecualian baru.
 */
const EXCEPTIONS: Record<string, string> = {
  "auth.actions.ts::loginAction": "Jalur publik: dijalankan sebelum sesi ada (proses login).",
  "auth.actions.ts::logoutAction": "Jalur publik: mengakhiri sesi, tidak butuh izin.",
  "setup.actions.ts::getSetupStatus":
    "Bootstrap pra-pengguna: langkah pemeriksaan wizard. Read-only dan hanya memaparkan " +
    "boolean terpasang/koneksi/skema (tanpa data tenant); sesudah terpasang halaman /setup " +
    "me-redirect dan action mengembalikan checks=null. Action setup yang MENULIS " +
    "(runSetup, provisionSetupSchema) tidak dikecualikan — keduanya assertCSRF + isInstalled().",
}

function collectUnguardedActions(): string[] {
  const unguarded: string[] = []
  const files = fs.readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".actions.ts"))

  for (const file of files) {
    const source = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8")
    // split menyisipkan nama fungsi di indeks ganjil, badannya di indeks berikutnya.
    const parts = source.split(/^export async function (\w+)/m)
    for (let i = 1; i < parts.length; i += 2) {
      const name = parts[i]
      const body = parts[i + 1] ?? ""
      if (!GUARD_PATTERN.test(body)) unguarded.push(`${file}::${name}`)
    }
  }

  return unguarded.sort()
}

describe("cakupan guard otorisasi server action", () => {
  const unguarded = collectUnguardedActions()

  it("tidak ada action tanpa guard di luar pengecualian yang didokumentasikan", () => {
    const unexpected = unguarded.filter((entry) => !(entry in EXCEPTIONS))
    expect(unexpected).toEqual([])
  })

  it("seluruh pengecualian masih relevan (tidak ada yang usang)", () => {
    // Kalau sebuah action akhirnya diberi guard, entri pengecualiannya harus dihapus —
    // supaya daftar ini tidak perlahan menjadi tempat menyembunyikan celah.
    const stale = Object.keys(EXCEPTIONS).filter((entry) => !unguarded.includes(entry))
    expect(stale).toEqual([])
  })

  it("memindai berkas action yang benar-benar ada", () => {
    const files = fs.readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".actions.ts"))
    // Sanity: kalau polanya berhenti cocok (mis. penulisan action berubah), tes ini
    // gagal alih-alih "lulus" karena tidak menemukan apa pun.
    expect(files.length).toBeGreaterThan(20)
    expect(unguarded.length).toBeGreaterThanOrEqual(Object.keys(EXCEPTIONS).length)
  })
})
