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
    // Surat jalan hanya dihitung laporan Pemenuhan Pesanan saat berstatus
    // shipped/delivered. Tanpa tombol ini semua surat jalan tersangkut di konsep
    // dan "terkirim" selalu 0 — persis keluhan yang memicu perbaikan rantai ini.
    action: "shipDeliveryOrder",
    definedIn: "src/actions/sales.actions.ts",
    callersIn: ["penjualan/surat-jalan"],
  },
  {
    action: "deliverDeliveryOrder",
    definedIn: "src/actions/sales.actions.ts",
    callersIn: ["penjualan/surat-jalan"],
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

/** Komponen generik yang BENAR-BENAR memanggil prop aksinya — rantai dua hop
 *  sah: halaman meneruskan `action={namaAksi}`/`processAction={namaAksi}` ke
 *  komponen ini, dan komponen ini memanggil prop-nya. Tanpa rantai ini, aksi
 *  yang tersambung lewat tombol generik terlihat "tak terpanggil". */
const GENERIC_INVOKERS: Record<string, RegExp> = {
  // ProcessButton/DeleteButton: `const result = await action(id)`
  "src/components/ui/process-button.tsx": /\bawait\s+action\s*\(/,
  "src/components/ui/delete-button.tsx": /\bawait\s+action\s*\(/,
  // VoidButton: `run: … => action(id, …)`
  "src/components/ui/void-button.tsx": /\baction\s*\(\s*id\b/,
  // ActionDropdown: `await processAction(deleteId)` / `await deleteAction(deleteId)`
  "src/components/ui/action-dropdown.tsx": /\bawait\s+(?:processAction|deleteAction)\s*\(/,
  // DraftReleaseActions: `await deleteAction(entity.id)`
  "src/components/ui/draft-release-actions.tsx": /\bawait\s+deleteAction\s*\(/,
}

/**
 * Kosongkan isi komentar sambil mempertahankan string/template, panjang, dan
 * posisi baris — supaya sebutan aksi di komentar tak terbaca sebagai panggilan.
 */
function blankComments(src: string): string {
  const out = src.split("")
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") { out[i] = " "; i++ }
      continue
    }
    if (c === "/" && c2 === "*") {
      out[i] = " "; if (i + 1 < n) out[i + 1] = " "
      i += 2
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " "
        i++
      }
      if (i < n) { out[i] = " "; if (i + 1 < n) out[i + 1] = " "; i += 2 }
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c
      i++
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue }
        if (src[i] === quote) { i++; break }
        if (quote !== "`" && src[i] === "\n") break
        i++
      }
      continue
    }
    i++
  }
  return out.join("")
}

/** Specifier modul yang menunjuk berkas pendefinisi aksi, mis.
 *  `src/actions/sales.actions.ts` ← `@/actions/sales.actions` / `./sales.actions`. */
function moduleMatches(spec: string, definedIn: string): boolean {
  const base = definedIn.split("/").pop()!.replace(/\.tsx?$/, "")
  return spec === `@/actions/${base}` || spec === base || spec.endsWith(`/${base}`)
}

/** Nama lokal untuk `action` dari import bernama di modul pendefinisinya
 *  (mendukung alias `postInvoice as postInv`); null bila tak diimpor dari sana. */
function importedLocalName(action: string, source: string, definedIn: string): string | null {
  for (const m of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
    if (!moduleMatches(m[2], definedIn)) continue
    for (const part of m[1].split(",")) {
      const binding = /^\s*(?:type\s+)?(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(part)
      if (binding && binding[1] === action) return binding[2] ?? binding[1]
    }
  }
  return null
}

/** Nama lokal komponen generik (GENERIC_INVOKERS) yang diimpor berkas ini. */
function genericComponentNames(source: string): Set<string> {
  const names = new Set<string>()
  for (const m of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
    const base = m[2].split("/").pop()!
    if (!Object.keys(GENERIC_INVOKERS).some((rel) => rel.endsWith(`/${base}.tsx`))) continue
    for (const part of m[1].split(",")) {
      const binding = /^\s*(?:type\s+)?(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(part)
      if (binding) names.add(binding[2] ?? binding[1])
    }
  }
  return names
}

/** Tersambung NYATA (round2 #18 — versi lama hanya menuntut regex nama muncul):
 *  1. Aksinya WAJIB diimpor (nama/alias) dari modul pendefinisinya. Import
 *     dari modul lain, fungsi lokal bernama sama, dan sebutan di komentar
 *     TIDAK dihitung.
 *  2. Lalu salah satu: (a) pemanggilan langsung `namaLokal(` — bukan metode
 *     (`obj.aksi(`), bukan deklarasi (`function aksi(`); atau (b) diteruskan
 *     sebagai prop `action/processAction/deleteAction` ke komponen generik
 *     yang diimpor dari GENERIC_INVOKERS (yang terbukti memanggil prop-nya).
 *     Meneruskan ke komponen lain TIDAK dihitung — rantainya putus di sana. */
function isWired(action: string, source: string, definedIn: string): boolean {
  const bersih = blankComments(source)
  const lokal = importedLocalName(action, bersih, definedIn)
  if (!lokal) return false

  // (a) Pemanggilan langsung.
  const callRe = new RegExp(`\\b${lokal}\\s*\\(`, "g")
  let m: RegExpExecArray | null
  while ((m = callRe.exec(bersih)) !== null) {
    const before = bersih.slice(Math.max(0, m.index - 12), m.index)
    if (/[.\w$]$/.test(before) || /\bfunction\s*$/.test(before)) continue
    return true
  }

  // (b) Diteruskan ke komponen generik yang terbukti memanggil prop aksinya.
  const generik = genericComponentNames(bersih)
  if (generik.size === 0) return false
  for (const nama of generik) {
    const tagRe = new RegExp(`<${nama}\\b`, "g")
    let t: RegExpExecArray | null
    while ((t = tagRe.exec(bersih)) !== null) {
      // Teks tag sampai `>` di luar kurung kurawal (prop bisa berisi `=>`/`===`).
      let depth = 0
      let end = t.index
      for (; end < bersih.length; end++) {
        if (bersih[end] === "{") depth++
        else if (bersih[end] === "}") depth--
        else if (bersih[end] === ">" && depth === 0) break
      }
      const tag = bersih.slice(t.index, end)
      if (
        new RegExp(
          `(?:action|processAction|deleteAction)\\s*=\\s*\\{[^}]*\\b${lokal}\\b[^}]*\\}`,
        ).test(tag)
      ) {
        return true
      }
    }
  }
  return false
}

describe("aksi transisi wajib tersambung ke UI", () => {
  const repoRoot = process.cwd()
  const files = walk(path.join(repoRoot, "src"))

  it("komponen generik yang dirujuk rantai dua-hop benar-benar memanggil prop aksinya", () => {
    for (const [rel, pola] of Object.entries(GENERIC_INVOKERS)) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf8")
      expect(pola.test(src), `${rel} tidak lagi memanggil prop aksinya — rantai dua-hop putus`).toBe(true)
    }
  })

  it("detektor pemanggilan (round2 #18): import/sebutan/fungsi-lokal tidak dihitung", () => {
    const def = "src/actions/sales.actions.ts"
    const imp = `import { postInvoice } from "@/actions/sales.actions"\n`
    // Hanya diimpor, tak pernah dipanggil/diteruskan → tak tersambung.
    expect(isWired("postInvoice", imp + "export const x = 1", def)).toBe(false)
    // Disebut di komentar sebagai panggilan → tak tersambung.
    expect(isWired("postInvoice", imp + "// await postInvoice(id)", def)).toBe(false)
    // Fungsi lokal bernama sama tanpa import → tak tersambung.
    expect(isWired("postInvoice", "async function postInvoice(id: number) { return id }", def)).toBe(false)
    // Diimpor dari modul LAIN lalu dipanggil → tak tersambung.
    expect(
      isWired("postInvoice", `import { postInvoice } from "@/actions/other.actions"\nawait postInvoice(id)`, def),
    ).toBe(false)
    // Metode objek bernama sama → tak tersambung.
    expect(isWired("postInvoice", imp + "await api.postInvoice(id)", def)).toBe(false)
    // Panggilan langsung (termasuk lewat arrow pembungkus) → tersambung.
    expect(isWired("postInvoice", imp + "onPress={() => run(() => postInvoice(id))}", def)).toBe(true)
    // Alias import yang dipanggil → tersambung.
    expect(
      isWired("postInvoice", `import { postInvoice as postInv } from "@/actions/sales.actions"\nawait postInv(id)`, def),
    ).toBe(true)
    // Diteruskan ke komponen generik yang terbukti memanggil prop-nya → tersambung.
    expect(
      isWired(
        "postInvoice",
        imp +
          `import { ProcessButton } from "@/components/ui/process-button"\n` +
          `<ProcessButton id={id} action={status === "draft" ? postInvoice : undefined} />`,
        def,
      ),
    ).toBe(true)
    // Diteruskan ke komponen BUKAN generik → rantai putus, tak tersambung.
    expect(
      isWired(
        "postInvoice",
        imp +
          `import { FancyButton } from "@/components/ui/fancy-button"\n` +
          `<FancyButton action={postInvoice} />`,
        def,
      ),
    ).toBe(false)
  })

  for (const { action, definedIn, callersIn } of REQUIRED_CALLERS) {
    it(`${action} dipanggil dari ${callersIn.join(" atau ")}`, () => {
      const callers = files.filter((file) => {
        const rel = path.relative(repoRoot, file).split(path.sep).join("/")
        if (rel === definedIn) return false
        if (rel.includes("__tests__")) return false
        return isWired(action, fs.readFileSync(file, "utf8"), definedIn)
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
        return isWired(action, fs.readFileSync(file, "utf8"), definedIn)
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
