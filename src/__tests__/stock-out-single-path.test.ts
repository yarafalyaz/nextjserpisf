import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga SATU-JALUR stok keluar untuk penjualan.
 *
 * Keadaan repo yang sudah diverifikasi: stok keluar penjualan terjadi di SATU
 * tempat saja — `onSalesInvoicePosted` (src/lib/hooks/accounting.hook.ts), yang
 * mengurangi `qty_on_hand`, mengonsumsi lapisan FIFO, dan menulis HPP saat FAKTUR
 * diposting. Surat jalan TIDAK menyentuh stok sama sekali (tidak ada hook surat
 * jalan di src/lib/hooks). Mengembalikan stok saat faktur dibatalkan dikerjakan
 * `sales-invoice-posting.service.ts` (dokumen SM-REV-INV-*).
 *
 * Mengapa harus dijaga: kalau kelak ada yang menambahkan efek stok pada surat
 * jalan "supaya rantai terhubung", stok akan keluar DUA KALI untuk satu penjualan
 * (sekali di surat jalan, sekali di faktur) dan angka HPP serta stok fisik jadi
 * salah tanpa error apa pun. Celah seperti itu tidak akan terlihat oleh tes lain:
 * semuanya tetap lulus, hanya angkanya salah.
 *
 * Jadi tes ini bukan mengunci "stok harus keluar di faktur selamanya"; ia memaksa
 * keputusan SADAR. Bila pemilik repo memutuskan stok keluar di surat jalan
 * (barang fisik dikirim lebih dulu daripada faktur), yang diubah: pindahkan
 * pengurangan stok/HPP ke surat jalan, HAPUS dari faktur, lalu perbarui daftar di
 * bawah — supaya tidak ada dua jalur.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

/** Ambil badan fungsi berdasarkan nama, dengan penyeimbangan kurung kurawal. */
function functionBody(src: string, name: string): string {
  const start = src.search(new RegExp(`export async function ${name}\\s*\\(`))
  if (start < 0) throw new Error(`fungsi ${name} tidak ditemukan`)
  const open = src.indexOf("{", start)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  throw new Error(`badan fungsi ${name} tidak seimbang`)
}

const SALES = "src/actions/sales.actions.ts"
const ACCOUNTING = "src/lib/hooks/accounting.hook.ts"
const REVERSAL = "src/lib/services/sales-invoice-posting.service.ts"

/** Gerakan yang berarti "stok/HPP ikut berubah". */
const STOCK_EFFECT =
  /qty_on_hand|stockMove|stock_moves|itemTransaction|item_transactions|consumeFifoLayers|inventoryFifo|createInLayer/i

describe("stok keluar penjualan hanya punya SATU jalur", () => {
  it("surat jalan (buat, kirim, terkirim) tidak menyentuh stok — mencegah stok keluar dua kali", () => {
    const src = read(SALES)
    for (const fn of ["createDeliveryOrder", "shipDeliveryOrder", "deliverDeliveryOrder"]) {
      const body = functionBody(src, fn)
      const hit = body.match(STOCK_EFFECT)
      expect(
        hit,
        `${fn} menyentuh "${hit?.[0]}" — stok penjualan sudah keluar saat faktur ` +
          `diposting (onSalesInvoicePosted). Menambah efek stok di surat jalan ` +
          `membuat stok dan HPP terhitung dua kali. Lihat docs/audit-rantai-dokumen.md.`
      ).toBeNull()
    }
  })

  it("faktur yang diposting tetap menjadi jalur pengurangan stok untuk penjualan", () => {
    const body = functionBody(read(ACCOUNTING), "onSalesInvoicePosted")
    expect(body).toMatch(/qty_on_hand\s*=\s*qty_on_hand\s*-/)
    // HPP/COGS ikut di jalur yang sama, bukan di dokumen lain.
    expect(body.toLowerCase()).toContain("cogs")
  })

  it("pembatalan faktur mengembalikan stok lewat layanan pembalik, bukan lewat surat jalan", () => {
    const src = read(REVERSAL)
    expect(src).toMatch(/qty_on_hand\s*=\s*qty_on_hand\s*\+/)
    expect(src).toContain("SM-REV-INV-")
  })

  it("tidak ada hook surat jalan yang diam-diam menambah jalur stok", () => {
    // Kalau seseorang menambahkan src/lib/hooks/delivery-order.hook.ts, jalur kedua
    // lahir di luar pandangan tes ini. Gagalkan supaya keputusannya sadar.
    expect(() => read("src/lib/hooks/delivery-order.hook.ts")).toThrow()
    expect(() => read("src/lib/hooks/surat-jalan.hook.ts")).toThrow()
  })
})
