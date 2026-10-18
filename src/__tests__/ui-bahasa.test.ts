import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guard: teks antarmuka berbahasa Inggris tidak boleh bocor ke layar pemakai.
 *
 * Konvensi repo: semua label, status, dan teks yang terlihat pemakai berbahasa
 * Indonesia (lihat `docs/AUDIT-UI-BAHASA.md` + `references/teks-ui-bahasa-indonesia.md`
 * di skill silengkap-erp). Tiga kelas bocor yang pernah nyata:
 *
 * (a) `window.confirm`/`alert`/`prompt` — dialog bawaan browser berbahasa Inggris
 *     di luar kendali aplikasi; migrasinya ke `ConfirmDialog`
 *     (`src/components/ui/confirm-dialog.tsx`). Korpus = `src/` produksi
 *     (berkas `__tests__` + `*.test.*` dikecualikan).
 * (b) Label tombol Inggris (`Save`/`Delete`/`Cancel`/`Submit`/`Back`) — dicek di
 *     ISI tombol (`<Button>…</Button>`, `<button>`, `<SubmitButton>`) dan
 *     `aria-label`-nya, bukan di seluruh baris: komentar (`// Delete …`),
 *     `type="submit"`, `AlertDialogPrimitive.Cancel`, dan izin `delete_*`
 *     bukan label yang dilihat pemakai. Batas sadar: label Inggris di LUAR
 *     tombol (header tabel, `placeholder`, opsi `Select`) TIDAK dicakup —
 *     pemindai kata per baris di sana hanya menghasilkan positif-palsu
 *     (`No. Dokumen`, komponen `<Select>`, `loading.tsx`).
 * (c) String Inggris di generator PDF pelanggan (`src/lib/pdf/generator.ts`):
 *     `QUOTATION` dan `NOTE :` (dulu `doc.text("QUOTATION")`, `"NOTE :"`);
 *     dokumen kirim-pelanggan ikut aturan bahasa yang sama. Kunci huruf
 *     BESAR-nya supaya padanan Indonesia (`QuotationPDFInfo`, `noteText`)
 *     tidak ikut tertuduh.
 *
 * Penjaga memindai dirinya lebih dulu (jumlah berkas produksi > 1000, blok
 * tombol > 100): pemindaian yang rusak tidak boleh lolos sebagai "bersih".
 */
const ROOT = path.resolve(__dirname, "../..")
const SELF = "ui-bahasa.test.ts"

/** Berkas produksi: src ts/tsx, tanpa `__tests__` dan tanpa `*.test.*`. */
function productionFiles(dir: string, out: string[] = []): string[] {
  const full = path.join(ROOT, dir)
  if (!fs.existsSync(full)) return out
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    if (entry.name === "__tests__" || /\.test\.tsx?$/.test(entry.name)) continue
    if (entry.name === SELF) continue
    const child = path.join(full, entry.name)
    if (entry.isDirectory()) productionFiles(path.relative(ROOT, child), out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(child)
  }
  return out
}

/** Komentar dihilangkan agar `// Delete …` tidak tertuduh sebagai label. */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/\/\/[^\n]*/g, "")
}

/** Isi tiap `<Button>…</Button>` / `<button>` / `<SubmitButton>` + aria-label pembukanya. */
function buttonBlocks(src: string): Array<{ inner: string; opener: string }> {
  const clean = blankComments(src)
  const out: Array<{ inner: string; opener: string }> = []
  const re = /<(Button|button|SubmitButton)\b[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(clean)) !== null) {
    const tag = m[1]
    const openEnd = m.index + m[0].length
    const close = clean.indexOf(`</${tag}>`, openEnd)
    if (close < 0) continue
    const inner = clean
      .slice(openEnd, close)
      .replace(/<[A-Za-z][^>]*>/g, " ")
      .replace(/<\/[A-Za-z][^>]*>/g, " ")
    out.push({ inner, opener: m[0] })
  }
  return out
}

const LABEL_INGGRIS = /\b(Save|Delete|Cancel|Submit|Back)\b/

function ariaLabel(opener: string): string | null {
  return /aria-label\s*=\s*"([^"]*)"/.exec(opener)?.[1] ?? null
}

describe("ui bahasa: tanpa dialog bawaan browser di produksi", () => {
  it(
    "window.confirm/alert/prompt nol di src/ produksi",
    () => {
      const files = productionFiles("src")
      expect(files.length).toBeGreaterThan(1000)
      const pelanggar: string[] = []
      for (const file of files) {
        const src = fs.readFileSync(file, "utf8")
        for (const m of src.matchAll(/window\s*\.\s*(confirm|alert|prompt)\s*\(/g)) {
          const baris = src.slice(0, m.index).split("\n").length
          pelanggar.push(`${path.relative(ROOT, file)}:${baris}: window.${m[1]}()`)
        }
      }
      expect(
        pelanggar,
        pelanggar.length > 0
          ? "Dialog bawaan browser berbahasa Inggris di luar kendali aplikasi — " +
              "pakai ConfirmDialog (src/components/ui/confirm-dialog.tsx):\n" +
              pelanggar.join("\n")
          : undefined,
      ).toEqual([])
    },
    20_000,
  )
})

describe("ui bahasa: tanpa label tombol Inggris di produksi", () => {
  it(
    "Save/Delete/Cancel/Submit/Back nol di isi <Button> dan aria-label-nya",
    () => {
      const files = productionFiles("src")
      let blok = 0
      const pelanggar: string[] = []
      for (const file of files) {
        const src = fs.readFileSync(file, "utf8")
        for (const { inner, opener } of buttonBlocks(src)) {
          blok++
          if (LABEL_INGGRIS.test(inner)) {
            pelanggar.push(
              `${path.relative(ROOT, file)}: isi tombol "${inner.trim().slice(0, 60)}"`,
            )
          }
          const aria = ariaLabel(opener)
          if (aria && LABEL_INGGRIS.test(aria)) {
            pelanggar.push(`${path.relative(ROOT, file)}: aria-label "${aria}"`)
          }
        }
      }
      // Kontrol positif: pemindaian harus benar-benar menemukan ratusan tombol.
      expect(blok).toBeGreaterThan(100)
      expect(
        pelanggar,
        pelanggar.length > 0
          ? "Label tombol Inggris bocor ke layar — pakai padanan Indonesia " +
              "(Simpan/Hapus/Batal/Kirim/Kembali):\n" +
              pelanggar.join("\n")
          : undefined,
      ).toEqual([])
    },
    20_000,
  )
})

describe("ui bahasa: tanpa string Inggris di generator PDF", () => {
  it("QUOTATION dan NOTE : nol di src/lib/pdf/generator.ts", () => {
    const pdf = fs.readFileSync(path.join(ROOT, "src/lib/pdf/generator.ts"), "utf8")
    expect(pdf.length).toBeGreaterThan(10_000)
    const pelanggar: string[] = []
    if (pdf.includes("QUOTATION")) pelanggar.push('QUOTATION (pakai "PENAWARAN HARGA")')
    if (pdf.includes("NOTE :")) pelanggar.push('NOTE : (pakai "CATATAN :")')
    expect(
      pelanggar,
      pelanggar.length > 0
        ? "String Inggris di dokumen kirim-pelanggan:\n" + pelanggar.join("\n")
        : undefined,
    ).toEqual([])
  })
})
