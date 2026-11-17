import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Regresi audit 2026-11-17: kaki `Dr PPN Keluaran (Retur)` pernah berada DI
 * DALAM blok `if (linkedToInvoice && priceTotal > 0)`. Akibatnya retur tanpa
 * harga (barang diganti kirim ulang, priceTotal 0) tidak pernah mengkreditkan
 * PPN walau `returnVatTotal > 0` — padahal guard pemetaan akun di atasnya
 * menuntut `salesTaxAccountId` TANPA syarat harga. PPN atas penyerahan yang
 * sama jadi terutang dua kali begitu retur diganti faktur baru.
 *
 * Guard ini menjaga bentuk kode: kaki PPN wajib di luar blok harga.
 */

const SRC = readFileSync(
  path.join(process.cwd(), "src", "lib", "hooks", "accounting.hook.ts"),
  "utf8",
)

describe("kaki PPN retur penjualan", () => {
  it("kaki PPN tidak berada di dalam blok harga", () => {
    const blokHarga = SRC.indexOf("if (linkedToInvoice && priceTotal > 0) {")
    expect(blokHarga).toBeGreaterThan(-1)

    // Akhir blok harga = `}` pada indentasi 4 spasi sesudah pembukaannya.
    const akhirBlok = SRC.indexOf("\n    }\n", blokHarga)
    expect(akhirBlok).toBeGreaterThan(blokHarga)

    const kakiPpn = SRC.indexOf('memo: "PPN Keluaran (Retur)"')
    expect(kakiPpn).toBeGreaterThan(-1)

    expect(
      kakiPpn > akhirBlok,
      "Kaki PPN Keluaran (Retur) kembali berada di dalam blok priceTotal > 0 — retur tanpa harga akan kehilangan PPN.",
    ).toBe(true)
  })

  it("guard pemetaan akun PPN tetap tanpa syarat harga", () => {
    // Kalau guard ini ikut dikurung harga, invariannya jadi konsisten tapi
    // PPN retur-harga-nol tetap lolos tanpa jurnal. Keduanya harus berdiri
    // sendiri-sendiri: kaki PPN wajib ada kapan pun returnVatTotal > 0.
    expect(SRC).toContain("if (returnVatTotal > 0 && !settings.salesTaxAccountId)")
  })
})
