import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Aksi transisi dokumen harus benar-benar dapat dipanggil dari UI.
 *
 * Kelas bug ini sudah pernah lolos ke produksi: `postInvoice` dan
 * `completeSalesReturn` terdefinisi lengkap (guard izin, gate approval, klaim
 * atomik, hook GL + stok) tetapi tidak dipanggil dari mana pun — akibatnya
 * faktur manual tak pernah terposting (tanpa jurnal piutang & tanpa stok keluar)
 * dan retur tak pernah selesai. Tidak ada test unit yang menangkapnya karena
 * semuanya menguji aksi secara langsung.
 *
 * Test ini memastikan tiap aksi transisi punya pemanggil di halaman/modul yang
 * seharusnya, jadi menghapus tombolnya akan langsung memerahkan test.
 */
const REQUIRED_CALLERS: Array<{ action: string; definedIn: string; callersIn: string[] }> = [
  {
    action: "postInvoice",
    definedIn: "src/actions/sales.actions.ts",
    callersIn: ["penjualan/faktur"],
  },
  {
    action: "completeSalesReturn",
    definedIn: "src/actions/sales.actions.ts",
    callersIn: ["penjualan/retur"],
  },
  {
    // `createJournal` membuat jurnal DRAFT; hanya `postJournal` yang mempostingnya. Selama
    // aksi ini tak tersambung, jurnal manual tak pernah masuk pembukuan (laporan hanya
    // membaca POSTED/REVERSED) — dan seed pun menirunya secara manual.
    action: "postJournal",
    definedIn: "src/actions/finance.actions.ts",
    callersIn: ["keuangan/jurnal"],
  },
  {
    // Pembayaran vendor dibuat DRAFT; `confirmVendorPayment` yang memposting jurnal kas/bank
    // dan mengalokasikannya ke tagihan terbuka. Tanpa pemanggil UI, utang usaha tetap
    // terbuka dan transfer pemasok tak punya apa pun untuk ditandai.
    action: "confirmVendorPayment",
    definedIn: "src/actions/purchase.actions.ts",
    callersIn: ["pembelian/pembayaran-vendor"],
  },
  {
    // Alur penawaran sendiri: draft -> terkirim -> diterima/ditolak. Ketiganya menulis
    // quotationHistory (dirender timeline detail) dan accept juga menotifikasi admin —
    // efek yang tak dimiliki rute status generik.
    action: "sendQuotation",
    definedIn: "src/actions/sales.actions.ts",
    callersIn: ["penjualan/penawaran"],
  },
  {
    action: "acceptQuotation",
    definedIn: "src/actions/sales.actions.ts",
    callersIn: ["penjualan/penawaran"],
  },
  {
    action: "rejectQuotation",
    definedIn: "src/actions/sales.actions.ts",
    callersIn: ["penjualan/penawaran"],
  },
  {
    // PO: chip daftar menawarkan status `cancelled` (pembelian/pesanan/page.tsx) tetapi
    // penyebabnya tak pernah bisa dipakai dari UI sebelum tombol ini ada.
    action: "cancelPurchaseOrder",
    definedIn: "src/actions/purchase.actions.ts",
    callersIn: ["pembelian/pesanan"],
  },
  {
    // Retur: chip daftar menawarkan `returned`, dan status itu hanya lahir dari aksi ini
    // (stok + jurnal pembalik).
    action: "processPurchaseReturn",
    definedIn: "src/actions/purchase.actions.ts",
    callersIn: ["pembelian/retur"],
  },
  {
    // Pesan bulk delete menolak menghapus SO massal dan mengarahkan ke hapus per-baris,
    // tetapi jalan itu tak pernah ada; dropdown tabel kini menyediakannya.
    action: "deleteSalesOrder",
    definedIn: "src/actions/sales.actions.ts",
    callersIn: ["penjualan/pesanan"],
  },
  {
    // Timeline detail sudah merender baris "Revisi" dari quotationHistory yang hanya
    // ditulis aksi ini (butuh alasan; hanya dari status sent).
    action: "reviseQuotation",
    definedIn: "src/actions/sales.actions.ts",
    callersIn: ["penjualan/penawaran"],
  },
  {
    // Pengeluaran berstatus `approved` tak punya jalan ke `paid`; aksi ini memposting
    // jurnal kas/bank-nya (dan `paid` juga menggerbangi penghapusan).
    action: "markExpensePaid",
    definedIn: "src/actions/finance.actions.ts",
    callersIn: ["keuangan/pengeluaran"],
  },
  {
    // Seksi biaya produksi sudah bisa menambah dan menghapus, tetapi tak bisa membetulkan
    // salah input; kini tiap baris bisa disunting di tempat (vendorId dibawa apa adanya).
    action: "updateProductionCost",
    definedIn: "src/actions/production-cost.actions.ts",
    callersIn: ["produksi/production-orders"],
  },
]

/**
 * Aksi yang (saat audit) BELUM punya pemanggil UI, didaftarkan secara eksplisit
 * supaya "tak terjangkau" menjadi keadaan yang diketahui dan beralasan — bukan
 * senyap. Dua arah: tiap entri harus benar-benar belum tersambung; begitu ada yang
 * menyambungkannya (atau menghapusnya), test ini memerahkan dan memaksa daftar
 * diperbarui.
 *
 * Audit: 331 aksi server diperiksa; yang di sini semuanya **nol rujukan** di `src/`
 * (di luar berkas pendefinisinya). Bukan termasuk helper query murni
 * (`getCronLogs`, `getProjectProgress`, …) atau aksi auth legacy.
 */
const ALLOWED_UNWIRED: Array<{ action: string; definedIn: string; reason: string }> = [
]

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry.name)) acc.push(full)
  }
  return acc
}

describe("aksi transisi wajib tersambung ke UI", () => {
  const repoRoot = process.cwd()
  const files = walk(path.join(repoRoot, "src"))

  for (const { action, definedIn, callersIn } of REQUIRED_CALLERS) {
    it(`${action} dipanggil dari ${callersIn.join(" atau ")}`, () => {
      const callers = files.filter((file) => {
        const rel = path.relative(repoRoot, file).split(path.sep).join("/")
        if (rel === definedIn) return false
        if (rel.includes("__tests__")) return false
        const source = fs.readFileSync(file, "utf8")
        // Rujukan impor/pemakaian, bukan sekadar kemunculan nama di komentar.
        return new RegExp(`\\b${action}\\b\\s*[,}]|\\b${action}\\b\\s*\\)|=\\s*${action}\\b|\\b${action}\\b[,)\\s]*$`, "m").test(source)
      })

      expect(callers.length, `${action} tidak dipanggil dari mana pun`).toBeGreaterThan(0)

      const inExpectedModule = callers.some((file) =>
        callersIn.some((mod) => path.relative(repoRoot, file).split(path.sep).join("/").includes(mod)),
      )
      expect(
        inExpectedModule,
        `${action} hanya dipanggil dari ${callers.map((f) => path.relative(repoRoot, f)).join(", ")} — tidak ada di ${callersIn.join("/")}`,
      ).toBe(true)
    })
  }
})

/**
 * Arah kedua: entri di ALLOWED_UNWIRED harus benar-benar belum tersambung. Begitu
 * ada yang menyambungkannya, test memerahkan dan memaksa daftar diperbarui.
 */
describe("aksi transisi tanpa pemanggil UI terdaftar & tetap tak tersambung", () => {
  // Sejak (1b) dikerjakan, daftar ini kosong: tak ada lagi aksi transisi yang boleh tak
  // tersambung. Setiap pengecualian berikutnya harus disengaja — hapus asersi ini dan
  // tulis alasannya di ALLOWED_UNWIRED, supaya "tak terjangkau" kembali menjadi keadaan
  // yang diketahui, bukan senyap.
  it("tak ada aksi transisi yang dibiarkan tanpa pemanggil UI", () => {
    expect(
      ALLOWED_UNWIRED,
      `Masih ada aksi tak tersambung: ${ALLOWED_UNWIRED.map((e) => e.action).join(", ")}`,
    ).toHaveLength(0)
  })
  const repoRoot = process.cwd()
  const files = walk(path.join(repoRoot, "src"))

  for (const { action, definedIn, reason } of ALLOWED_UNWIRED) {
    it(`${action} masih belum tersambung — ${reason}`, () => {
      const refs = files.filter((file) => {
        const rel = path.relative(repoRoot, file).split(path.sep).join("/")
        if (rel === definedIn) return false
        // `__tests__` (termasuk berkas ini) dikecualikan: daftar di atas menyebut nama
        // aksinya, jadi tanpa pengecualian ini test menilai dirinya sendiri sebagai pemakai.
        if (rel.includes("__tests__")) return false
        return new RegExp(
          `\\b${action}\\b\\s*[,}]|\\b${action}\\b\\s*\\)|=\\s*${action}\\b|\\b${action}\\b[,)\\s]*$`,
          "m",
        ).test(fs.readFileSync(file, "utf8"))
      })
      expect(
        refs.map((f) => path.relative(repoRoot, f)),
        `${action} sudah tersambung — hapus dari ALLOWED_UNWIRED dan pindahkan ke REQUIRED_CALLERS`,
      ).toHaveLength(0)

      // Arah ketiga: aksinya sendiri harus MASIH ADA. Tanpa ini, menghapus aksi
      // meninggalkan entri basi yang lolos diam-diam (klaim docstring di atas
      // menyebut "atau menghapusnya" — kini benar-benar diperiksa).
      const sumber = fs.readFileSync(path.join(repoRoot, definedIn), "utf8")
      expect(
        new RegExp(`export async function ${action}\\b`).test(sumber),
        `${action} tidak lagi ada di ${definedIn} — hapus entri ini dari ALLOWED_UNWIRED`,
      ).toBe(true)
    })
  }
})
