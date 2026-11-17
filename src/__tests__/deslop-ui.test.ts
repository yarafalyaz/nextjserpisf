import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * Guard: aturan deslop-ui tidak boleh diregresi.
 *
 * Dua aturan diuji di sini, keduanya statis dan keduanya gagal pada apa yang tak
 * tertangkap tsc, lint, maupun tes biasa (salah ketik em dash tetap kompilasi):
 *
 *   R-02  EM DASH (—) dilarang di teks UI. Pemindaian memakai AST jsx/TS, bukan
 *         regex ke seluruh berkas: yang dihitung hanya literal yang BENAR-BENAR
 *         tampil — anak JSX (`>teks<`), prop teks (`placeholder=`, `title=`,
 *         `label`, `aria-label`, …), dan literal string di cabang kondisional
 *         yang mengalir ke sana. Komentar (jsx & TS) tidak pernah dihitung.
 *         PENGECUALIAN yang sah: placeholder nilai kosong — `?? "—"`, `? "—" :`,
 *         `: "—"`, `|| "—"` — dibaca dari cabang kondisionalnya, bukan dari
 *         kebetulan teks di sekitarnya. Daftar berkas di bawah dibekukan JUMLAH
 *         PERSIS dan diperiksa DUA ARAH: pelanggaran baru merah, jumlah turun
 *         (karena diperbaiki) juga merah dan entrinya wajib dipangkas.
 *
 *   TOUCH  Komponen bersama yang merender tombol di `src/components/ui/` tidak
 *         boleh hanya `size="sm"`/`"xs"` (24–32 px) tanpa penanda area sentuh
 *         44 px — `min-h-11` (atau `min-h-11 sm:min-h-9` di mobile) maupun
 *         perluasan `before:-inset-*`. Analisis kelas penuh per pemakaian terlalu
 *         rapuh, jadi yang dituntut di sini: setiap berkas tombol bersama WAJIB
 *         memuat penanda itu, dan daftarnya diperiksa dua arah (berkas baru = merah,
 *         entri basi setelah penanda dihapus = merah).
 */
const ROOT = process.cwd()
const SRC = path.join(ROOT, "src")

/* ── R-02: em dash di teks UI ─────────────────────────────────────────────── */

/** Prop yang nilainya dirender sebagai teks ke layar. */
const TEXT_PROPS = new Set([
  "placeholder",
  "title",
  "label",
  "alt",
  "description",
  "caption",
  "hint",
  "tooltip",
  "emptyMessage",
  "emptyLabel",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-valuetext",
])

const EM_DASH = "\u2014" // EM DASH, ditulis escape supaya tak tertukar dengan en dash

const PLACEHOLDER = /^\s*—\s*$/ // seluruh nilai adalah pengisi sel kosong

/**
 * Beku JUMLAH PERSIS per berkas. Angka diukur pada main tip (b1e92b31):
 * 147 kemunculan di 108 berkas — semuanya prosa halaman/laporan/form yang belum
 * digarap; NOL di `src/components/ui/**` (komponen bersama sudah bersih).
 *
 * Entri adalah UTANG deslop-ui, bukan lisensi: R-02 melarang em dash di teks UI,
 * jadi setiap entri yang menghilang WAJIB memangkas angkanya di commit yang sama.
 * Tambah entri hanya untuk pelanggaran yang sudah ada dan terbukti; menaikkan
 * angka untuk pelanggaran BARU selalu salah — perbaiki teksnya (pakai titik,
 * koma, atau tanda hubung), jangan bekukan.
 */
const ALLOWED_EM_DASH: Record<string, number> = {
  // KOSONG sejak 2026-11-17: sapuan R-02 membersihkan seluruh prosa em dash.
  // Placeholder nilai kosong (`?? "—"`) tetap sah lewat detektor AST, bukan
  // lewat daftar ini. Entri baru di sini wajib beralasan dan bertanggal.
}

// Berkas UI yang dipindai: seluruh `.tsx` dan `.ts` produksi di bawah `src`,
// kecuali `__tests__` dan berkas `*.test.*`/`*.spec.*`.
function sourceFiles(dir: string = SRC, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

interface EmDashHit {
  file: string
  line: number
  where: string
}

/**
 * Apakah literal `"—"` menempati posisi NILAI DEFAULT sebuah kondisional:
 * `x ?? "—"`, `x || "—"`, `x ? "—" : …`, `x ? y : "—"`. Yang diperiksa hanya
 * orang tua langsungnya — itulah yang membedakan pengisi sel kosong dari em
 * dash prosa (`"Kurang — tutup"` di cabang ternary tetap dilaporkan). Literal
 * `"—"` yang berdiri sendiri (anak JSX) BUKAN pengecualian.
 */
function isPlaceholderLiteral(literal: ts.Node): boolean {
  if (!ts.isStringLiteralLike(literal) || !PLACEHOLDER.test(literal.text)) return false
  // Naik melewati tanda kurung: `cond ? x : ("—")` idenya sama dengan cabang telanjang.
  let node: ts.Node = literal
  while (node.parent && ts.isParenthesizedExpression(node.parent)) node = node.parent
  const parent = node.parent
  if (!parent) return false
  if (ts.isConditionalExpression(parent)) return parent.whenTrue === node || parent.whenFalse === node
  return (
    ts.isBinaryExpression(parent) &&
    (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      parent.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
    parent.right === node
  )
}

/** Teks template dengan `—` di bagian statisnya (bukan di dalam `${…}`). */
function templateHasEmDash(node: ts.TemplateExpression): boolean {
  if (node.head.text.includes(EM_DASH)) return true
  return node.templateSpans.some((span) => span.literal.text.includes(EM_DASH))
}

/**
 * Telusuri ekspresi yang dirender sebagai teks. Ditelusuri: literal, template,
 * dan — untuk kondisional/`??`/`||` — kedua cabangnya, sehingga `—` di cabang
 * mana pun terklasifikasi benar (pengisi vs teks).
 */
function scanText(
  expr: ts.Node,
  onHit: (node: ts.Node) => void,
  descend = false,
): void {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    if (expr.text.includes(EM_DASH) && !isPlaceholderLiteral(expr)) onHit(expr)
    return
  }
  if (ts.isTemplateExpression(expr)) {
    if (templateHasEmDash(expr)) onHit(expr)
    return
  }
  if (ts.isConditionalExpression(expr)) {
    scanText(expr.whenTrue, onHit)
    scanText(expr.whenFalse, onHit)
    return
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
      scanText(expr.left, onHit)
      scanText(expr.right, onHit)
      return
    }
  }
  // Pembungkus `(…)` meneruskan konteks kondisional ke dalamnya: `cond ? x : ("—")`
  // tetap pengisi nilai kosong.
  if (ts.isParenthesizedExpression(expr)) {
    scanText(expr.expression, onHit, descend)
    return
  }
  // Turun hanya lewat konteks yang menghasilkan teks: elemen JSX (prop teks &
  // anaknya ditangani `visit`) dan objek/array literal (opsi picker memakai
  // `label: "…"`, dirender sebagai teks). Prop NON-teks (`data-*`, `href`,
  // `className`, `value`) tidak pernah diturunkan — isinya bukan teks layar.
  if (!descend) return
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) return
  if (expr.kind === ts.SyntaxKind.ObjectLiteralExpression || expr.kind === ts.SyntaxKind.ArrayLiteralExpression) {
    expr.forEachChild((child) => scanText(child, onHit, true))
    return
  }
  // Pembungkus murni (`(…)`, `as`, `satisfies`) diteruskan; simpul lain
  // (panggilan fungsi, kondisional ber-render callback) ditelusuri `visit`.
  if (ts.isAsExpression(expr) || ts.isSatisfiesExpression?.(expr) || ts.isTypeAssertionExpression(expr)) {
    expr.forEachChild((child) => scanText(child, onHit, true))
  }
}

export function emDashHits(source: string, fileName = "x.tsx"): { line: number; where: string }[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const hits: { line: number; where: string }[] = []
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
  // Sekali lapor per simpul asal supaya kutipan template ganda tidak terhitung dua.
  const seen = new Set<ts.Node>()
  const report = (where: string) => (node: ts.Node) => {
    const key = node.parent ?? node
    if (seen.has(key)) return
    seen.add(key)
    hits.push({ line: at(node), where })
  }

  // Ekspresi di dalam atribut ditangani cabang JsxAttribute; saat rekursi
  // generik mencapai simpul yang sama, jangan dipindai ulang sebagai anak
  // (`data-report-table={…}` bukan teks layar).
  const inAttribute = (node: ts.Node): boolean => {
    let p = node.parent
    while (p) {
      if (ts.isJsxAttribute(p)) return true
      if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxFragment(p)) return false
      p = p.parent
    }
    return false
  }

  const visit = (node: ts.Node) => {
    // Komentar tidak pernah dihitung: jsx comment `{/* … */}` berupa JsxExpression
    // tanpa expression, dan komentar TS tidak punya simpul sendiri.
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf)
      // `data-*` (atribut uji/ekspor, mis. `data-report-table`) bukan teks layar.
      if (TEXT_PROPS.has(name) && !name.startsWith("data-")) {
        const init = node.initializer
        if (ts.isStringLiteral(init)) {
          if (init.text.includes(EM_DASH) && !PLACEHOLDER.test(init.text)) {
            hits.push({ line: at(init), where: `prop ${name}` })
          }
        } else if (ts.isJsxExpression(init) && init.expression) {
          scanText(init.expression, report(`prop ${name}`), true)
        }
      }
    }
    if (ts.isJsxText(node) && node.text.includes(EM_DASH) && !PLACEHOLDER.test(node.text)) {
      hits.push({ line: at(node), where: "teks JSX" })
    }
    if (ts.isJsxExpression(node) && node.expression && !inAttribute(node)) {
      // Ekspresi anak: `{cond ? "a — b" : x}` — hanya cabang literal yang
      // dirender sebagai teks; `{x.fn("a — b")}` bukan teks UI dan tidak dihitung.
      scanText(node.expression, report("ekspresi JSX"), true)
      // Elemen di dalamnya tetap wajib ditelusuri (`.map((x) => <li>a — b</li>)`
      // bersembunyi di balik arrow function, bukan di cabang literal).
    }
    node.forEachChild(visit)
  }
  visit(sf)
  return hits
}

function collectEmDash(): { counts: Record<string, number>; hits: EmDashHit[]; scanned: number } {
  const counts: Record<string, number> = {}
  const hits: EmDashHit[] = []
  const files = sourceFiles()
  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/")
    for (const hit of emDashHits(fs.readFileSync(file, "utf8"), file)) {
      counts[relative] = (counts[relative] ?? 0) + 1
      hits.push({ file: relative, ...hit })
    }
  }
  return { counts, hits, scanned: files.length }
}

const formatHits = (hits: EmDashHit[]): string[] =>
  hits
    .sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1))
    .map((h) => `${h.file}:${h.line} (${h.where})`)

/* ── TOUCH: area sentuh 44 px pada tombol bersama ─────────────────────────── */

/**
 * Penanda area sentuh yang diterima: `min-h-11` (tinggi 44 px; pola repo
 * `min-h-11 sm:min-h-9` = 44 px di sentuh, 36 px di desktop), `size-11`
 * (tombol ikon 44 px), atau perluasan `before:-inset-*` untuk kontrol kecil
 * yang area kliknya dinaikkan lewat pseudo-element.
 */
const TOUCH_MARK = /min-h-11|size-11|before:-inset-/

/**
 * Berkas tombol bersama yang WAJIB memuat penanda area sentuh (daftar dua arah
 * terhadap hasil pemindaian). Aturannya, terukur pada main tip:
 *
 *   • Berkas yang benar-benar MENULIS tombol/trigger sendiri wajib punya
 *     penanda: 24–32 px (`size="sm"`/`"xs"`) tetap 24–32 px di layar sentuh,
 *     di bawah minimum 44 px (WCAG 2.5.8).
 *   • Pembungkus tipis yang hanya meneruskan props ke `Button`/dialog primitif
 *     (mis. `confirm-dialog` → `AlertDialogAction`, `select` →
 *     `SelectPrimitive.Trigger`, `calendar` → `buttonVariants`) TIDAK didaftar:
 *     ukuran & areanya ditentukan komponen yang mereka pakai.
 *
 * Nilai = kelas penanda yang benar-benar dipakai, supaya entri bukan nama kosong.
 */
const TOUCH_REQUIRED: Record<string, string> = {
  "src/components/ui/delete-button.tsx": "tombol ikon hapus per baris: min-h-11 min-w-11",
  "src/components/ui/status-actions.tsx": "Setujui/Tolak per baris: min-h-11",
  "src/components/ui/void-button.tsx": "Batalkan dokumen: min-h-11",
  "src/components/ui/reverse-payment-button.tsx": "balik pembayaran (size=sm): min-h-11 min-w-11",
  "src/components/ui/tax-invoice-number-button.tsx": "nomor faktur pajak (size=sm): min-h-11 min-w-11",
  "src/components/ui/action-dropdown.tsx": "pemicu menu aksi per baris: size-11",
  "src/components/ui/draft-release-actions.tsx": "pemicu menu draf/lepas: size-11",
  "src/components/ui/theme-toggle.tsx": "ganti tema di header: size-11",
  "src/components/ui/search-field.tsx": "bersihkan kolom cari: perluasan before:-inset-3",
  "src/components/ui/shadcn/sidebar.tsx": "SidebarTrigger mobile: size-11",
  "src/components/ui/combobox.tsx": "pemicu/buka & opsi combobox: min-h-11 dan perluasan before:-inset-y-1",
  "src/components/ui/data-table.tsx": "urut tabel: perluasan before:-inset-y-1.5",
  "src/components/ui/date-picker.tsx": "navigasi tanggal: perluasan before:-inset-*",
  "src/components/ui/month-picker.tsx": "navigasi bulan: perluasan before:-inset-*",
  "src/components/ui/filter-drawer.tsx": "pemicu laci filter mobile: min-h-11",
  "src/components/ui/shadcn/alert-dialog.tsx": "Aksi/Batal dialog primitif: min-h-11",
  "src/components/ui/shadcn/dialog.tsx": "tutup (X) & footer dialog: min-h-11",
}

/**
 * UTANG deslop-ui, dibekukan sebagai insiden: tombol kecil di berkas ini BELUM
 * memberi area sentuh 44 px. Angka = jumlah pemakaian tombol kecil tanpa penanda
 * di berkas itu (diukur pada main tip). Diperiksa DUA ARAH:
 *   • berlokasi — setiap insiden baru di luar daftar merah, dan naik di berkas
 *     terdaftar juga merah (pemakaian kecil ke-3 di berkas yang sama tak lolos);
 *   • perbaikan — jumlah turun, atau berkas hilang dari daftar, juga merah:
 *     perbaikan wajib memangkas entri ini di commit yang sama.
 * Perbaiki dengan menambah `min-h-11` (atau perluasan `before:-inset-*`) ke
 * tombol yang bersangkutan, lalu turunkan angkanya.
 *
 * Yang tersisa: tombol hapus baris item (`size="sm"` + `min-h-9` eksplisit,
 * yang menimpa warisan `min-h-11` dari `Button` bersama). Dua berkas lampiran
 * (`form-attachment-upload`, `transaction-attachments`) semula di sini dan sudah
 * lunas lewat perbaikan `min-h-11 sm:min-h-8` untuk `size="sm"` di `button.tsx`.
 */
const TOUCH_PINNED: Record<string, number> = {
  // KOSONG sejak 2026-11-17: `min-h-11 sm:min-h-9` dibayar di
  // invoice-items-editor (agent touch) dan Button size="sm" kini 44 px di
  // pointer kasar lewat button.tsx. Entri baru wajib beralasan.
}

/** Tag yang dianggap tombol: `<Button>`, `<button>`, `<Comp>` (Slot asChild). */
const BUTTON_TAG = /^(button|Button|Comp)$/
const SMALL_SIZE = new Set(["sm", "xs", "icon-xs", "icon-sm"])

interface ButtonUse {
  line: number
  small: boolean
  marked: boolean
}

/**
 * `Button` bersama menambahkan `min-h-11 sm:min-h-8` untuk `size="sm"` (lihat
 * `src/components/ui/button.tsx`). Pemakaian yang tidak membawa `sm:min-h-*`
 * sendiri tetap 44 px di layar sentuh, jadi warisan itu menjadi penanda — tetapi
 * kelas yang MENURUNKAN tinggi (`min-h-9`, `h-8`) mematikan warisan tersebut
 * (tailwind-merge menang atas kelas basis), jadi tetap dihitung insiden.
 */
const SHRINKS_HEIGHT = /(^|\s)(min-h|h)-(1|2|3|4|5|6|7|8|9|10)\b/
function markedFromButton(tag: string, reference: string | null, cls: string | null): boolean {
  if (tag !== "Button" || reference !== "sm") return false
  return cls === null || !SHRINKS_HEIGHT.test(cls)
}

function buttonUses(source: string, fileName = "x.tsx"): ButtonUse[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const uses: ButtonUse[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = ts.isJsxElement(node) ? node.openingElement : node
      const tag = open.tagName.getText(sf)
      if (BUTTON_TAG.test(tag)) {
        let size: string | null = null
        let cls: string | null = null
        for (const attr of open.attributes.properties) {
          if (!ts.isJsxAttribute(attr) || !attr.initializer) continue
          const name = attr.name.getText(sf)
          if (name === "size" && ts.isStringLiteral(attr.initializer)) size = attr.initializer.text
          if (name === "className" && ts.isStringLiteral(attr.initializer)) cls = attr.initializer.text
        }
        uses.push({
          line: sf.getLineAndCharacterOfPosition(open.getStart(sf)).line + 1,
          small: (size !== null && SMALL_SIZE.has(size)) || (cls !== null && /(^|\s)h-(6|7|8|10)\b/.test(cls)),
          marked: (cls !== null && TOUCH_MARK.test(cls)) || markedFromButton(tag, size, cls),
        })
      }
    }
    node.forEachChild(visit)
  }
  visit(sf)
  return uses
}

/** Berkas di `src/components/ui/**` yang merender tombol. */
function buttonFiles(): { relative: string; uses: ButtonUse[] }[] {
  const dir = path.join(SRC, "components", "ui")
  return sourceFiles(dir)
    .map((file) => ({
      relative: path.relative(ROOT, file).split(path.sep).join("/"),
      uses: buttonUses(fs.readFileSync(file, "utf8"), file),
    }))
    .filter((entry) => entry.uses.length > 0)
}

/* ── Beku dua arah: kunci identik & angka persis ──────────────────────────── */

function bedaKunci(a: Record<string, unknown>, b: Record<string, unknown>): { hanyaA: string[]; hanyaB: string[] } {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return {
    hanyaA: ka.filter((k) => !(k in b)).sort(),
    hanyaB: kb.filter((k) => !(k in a)).sort(),
  }
}

describe("R-02: em dash dilarang di teks UI", () => {
  it("tidak ada em dash baru di luar beku per berkas", () => {
    const { counts, hits, scanned } = collectEmDash()

    // Asersi non-vakum: pemindaian harus benar-benar menyentuh repo (tanpa ini
    // guard hijau palsu bila glob/path rusak dan tidak ada berkas terbaca).
    expect(scanned).toBeGreaterThan(2000)

    const luarBeku = hits.filter((hit) => !(hit.file in ALLOWED_EM_DASH))

    expect({ emDashBaru: formatHits(luarBeku) }).toEqual({ emDashBaru: [] })
    // Arah kedua: jumlah di berkas terdaftar harus PERSIS — em dash ke-2 di berkas
    // yang sudah terdaftar tetap merah, dan perbaikan wajib menurunkan angkanya.
    expect(counts).toEqual(ALLOWED_EM_DASH)
  })

  it("placeholder nilai kosong (`?? \"—\"`, `? \"—\" :`) sah dan tidak dilaporkan", () => {
    const sah = [
      `<td>{row.documentNo ?? "—"}</td>`,
      `<td>{row.party || "—"}</td>`,
      `<td>{row.vatDpp === null ? "—" : formatCurrency(row.vatDpp)}</td>`,
      `<DetailField label="Induk" value={c.parent ? c.parent.name : "—"} />`,
      `<td>{(cond ? "—" : null)}</td>`,
      `<span>Skor: {score ?? (aktif ? "—" : String(score))}</span>`,
      `// komentar — dengan em dash`,
      `/* blok — dengan em dash */`,
      `<div>{/* komentar JSX — dengan em dash */}</div>`,
      `<td>—</td>`, // sel kosong literal: pengisi, bukan prosa
      `<p>Pakai tanda hubung - biasa</p>`,
      `<span>a &ndash; b</span>`,
    ]
    for (const source of sah) expect([source, emDashHits(source)]).toEqual(expect.arrayContaining([source, []]))
  })

  it("menangkap em dash di teks JSX, prop teks, dan cabang kondisional", () => {
    const kasus: [string, string][] = [
      [`<p>Daftar unit — cari</p>`, "teks JSX"],
      [`<p className="x">a — b</p>`, "teks JSX"],
      [`<Input placeholder="Pilih — atau tidak" />`, "prop placeholder"],
      [`<Button title={"Simpan — sekarang"} />`, "prop title"],
      [`<Field label="Nominal — wajib" />`, "prop label"],
      [`<span aria-label={"Total — Rp0"}>x</span>`, "prop aria-label"],
      [`<td>{cond ? "Kurang — tutup" : "cukup"}</td>`, "ekspresi JSX"],
      [`<td>{\`\${sku} — \${nama}\`}</td>`, "ekspresi JSX"],
      [`<Chip label={\`\${a} — \${b}\`} />`, "prop label"],
    ]
    for (const [source, where] of kasus) {
      const hits = emDashHits(source)
      expect({ source, where: hits.map((h) => h.where) }, source).toEqual({ source, where: [where] })
    }
  })

  it("melaporkan nomor baris yang benar (pesan gagal menunjuk file:baris)", () => {
    const hits = emDashHits(`const a = 1\n\nfunction C() {\n  return <p>a — b</p>\n}`)
    expect(hits).toEqual([{ line: 4, where: "teks JSX" }])
  })
})

describe("TOUCH: area sentuh 44 px pada tombol bersama", () => {
  it("setiap berkas tombol bersama di daftar benar-benar memuat penandanya", () => {
    const salah: string[] = []
    for (const [relative, alasan] of Object.entries(TOUCH_REQUIRED)) {
      const full = path.join(ROOT, relative)
      if (!fs.existsSync(full)) {
        salah.push(`${relative}: berkas tidak ada`)
      } else if (!TOUCH_MARK.test(fs.readFileSync(full, "utf8"))) {
        salah.push(`${relative}: penanda area sentuh hilang (${alasan})`)
      }
      if (!/min-h-11|size-11|before:-inset-/.test(alasan)) {
        salah.push(`${relative}: alasan tak menyebut kelas penandanya`)
      }
    }
    expect({ salah: salah.sort() }).toEqual({ salah: [] })
  })

  it("tidak ada insiden tombol kecil tanpa penanda di luar beku TOUCH_PINNED", () => {
    const files = buttonFiles()

    // Asersi non-vakum: korpus tombol bersama harus benar-benar terbaca, dan
    // pemindaian harus menemukan tombol kecil + tombol berpenanda di main tip.
    expect(files.length).toBeGreaterThan(20)
    const all = files.flatMap((f) => f.uses)
    expect(all.length).toBeGreaterThan(40)
    expect(all.filter((use) => use.small).length).toBeGreaterThan(10)
    expect(all.filter((use) => use.marked).length).toBeGreaterThan(5)

    // Arah kedua untuk daftar wajib: setiap entri harus benar-benar ditemukan
    // pemindaian sebagai berkas yang merender tombol — entri yang berkasnya
    // berhenti merender tombol (atau hilang) basi dan wajib dipangkas.
    const ditemukan = Object.fromEntries(files.map((f) => [f.relative, true]))
    const entriBasi = Object.keys(TOUCH_REQUIRED).filter((relative) => !(relative in ditemukan))
    const insiden: string[] = []
    const counts: Record<string, number> = {}
    for (const { relative, uses } of files) {
      for (const use of uses) {
        if (!use.small || use.marked) continue
        counts[relative] = (counts[relative] ?? 0) + 1
        if (!(relative in TOUCH_PINNED)) insiden.push(`${relative}:${use.line}`)
      }
    }

    expect({ tombolKecilTanpaAreaSentuh: insiden.sort() }).toEqual({ tombolKecilTanpaAreaSentuh: [] })
    // Arah kedua insiden: angka naik = pemakaian tak berpenanda baru; angka
    // turun / berkas hilang = utang sudah dibayar, entri wajib dipangkas.
    expect(counts).toEqual(TOUCH_PINNED)
    expect({ entriTouchBasi: entriBasi }).toEqual({ entriTouchBasi: [] })
  })

  it("detektor tombol kecil: menghitung size kecil / h-* tanpa penanda, melewatkan yang berpenanda", () => {
    // Button bersama menambahkan min-h-11 untuk size="sm": terwarisi selama
    // kelas pemakaian tidak menurunkan tinggi kembali.
    expect(buttonUses(`<Button size="sm" className="px-2">x</Button>`)).toEqual([
      { line: 1, small: true, marked: true },
    ])
    expect(buttonUses(`<Button size="sm" className="min-h-11 min-w-11">x</Button>`)[0].marked).toBe(true)
    // Kelas yang menurunkan tinggi mematikan warisan Button → tetap insiden.
    expect(buttonUses(`<Button size="sm" className="min-h-9 px-2">x</Button>`)[0].marked).toBe(false)
    expect(buttonUses(`<Button className="px-2 text-xs h-8">x</Button>`)[0].small).toBe(true)
    expect(buttonUses(`<Button variant="primary">x</Button>`)[0].small).toBe(false)
    expect(buttonUses(`<button className="before:absolute before:-inset-3">x</button>`)[0]).toEqual({
      line: 1,
      small: false,
      marked: true,
    })
  })
})
