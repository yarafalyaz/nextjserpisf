import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Ratchet anti "slug query": tidak boleh ada lagi tautan/navigasi halaman
 * yang membawa IDENTITAS dokumen atau prefill lewat query string
 * (`?poId=`, `?invoiceId=`, `?tanggal=`, `?editBaris=`, …). Bentuk kanonisnya
 * adalah segmen path kunci/nilai (`tambah/po/<slug>`, `laporan/<periode>`,
 * halaman ubah terpisah); query lama hanya boleh DIBACA server untuk
 * memantul ke bentuk path, tidak boleh DITERBITKAN lagi sebagai tautan.
 *
 * Yang sengaja TIDAK dilarang (filter daftar, sesuai konvensi proyek):
 * `cari`, `status`, `tipe`, `halaman`, `pageSize`, dan sejenisnya — itu
 * keadaan daftar, bukan identitas dokumen. Endpoint `/api/*` juga di luar
 * larangan: query adalah kontrak normal API JSON.
 */

const SRC = path.join(process.cwd(), "src")

// Kunci query identitas/prefill yang sudah dimigrasikan ke path. Suffix
// `Id` mencakup poId/grId/billId/invoiceId/salesOrderId/quotationId/
// warehouseId/workOrderId/productId/sessionId/prId/partyId/accountId/
// costCenterId/vendorId-keluarga-id, sisanya kunci non-Id dari riwayat
// migrasi (tanggal/bulan/periode/tahun laporan & absensi, edit inline,
// merek kendaraan, daftar item stok minimum).
const FORBIDDEN_KEY =
  /(?:[A-Za-z]*Id|tanggal[A-Za-z]*|bulan|periode|tahun|edit[A-Za-z]*|merek|item)=/

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue
      // API routes: query adalah kontrak JSON, bukan URL halaman.
      if (full === path.join(SRC, "app", "api")) continue
      collectFiles(full, out)
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** Komentar didokumentasikan bebas menyebut query lama (memang itu gunanya
 * catatan redirect); yang dilarang adalah kode yang menerbitkannya. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1")
}

describe("tidak ada tautan halaman yang menerbitkan query identitas/prefill", () => {
  it("tidak ada pola ?<kunci-identitas>= di src/app & src/components", () => {
    const offenders: string[] = []
    for (const file of collectFiles(path.join(SRC, "app")).concat(
      collectFiles(path.join(SRC, "components")),
    )) {
      const text = stripComments(fs.readFileSync(file, "utf8"))
      for (const match of text.matchAll(/\?[^"'\s`]*?(?==)/g)) {
        const keyPart = match[0].slice(1)
        if (FORBIDDEN_KEY.test(`${keyPart}=`)) {
          offenders.push(`${path.relative(process.cwd(), file)} → ?${keyPart}=`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
