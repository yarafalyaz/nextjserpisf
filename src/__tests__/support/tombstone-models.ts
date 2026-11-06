import fs from "node:fs"
import path from "node:path"

/**
 * Himpunan model yang benar-benar bisa berisi tombstone — dipakai bersama oleh
 * penjaga `detail-page-tombstone` (halaman detail) dan `form-picker-tombstone`
 * (daftar opsi form), supaya keduanya tidak bisa menyimpang.
 *
 * Daftar TIDAK ditulis tangan. Sumbernya irisan dua hal yang harus sepakat:
 *
 *   1. `prisma/schema.prisma` — model yang punya kolom `deletedAt`.
 *   2. `src/actions`/`src/lib` — model yang ditulisi `deletedAt: <bukan null>`
 *      sebagai kunci tingkat-atas di dalam `data:` sebuah `update`/`updateMany`
 *      (`deletedAt: null` adalah restore, bukan hapus).
 *
 * Memakai (1) saja terlalu luas — 42 model berkolom `deletedAt` tetapi
 * kebanyakan delete-nya keras — dan penjaga hanya menuntut diff kosong.
 * Memakai (2) saja akan meloloskan penulis yang lupa menambah kolom. Irisan
 * membuat penjaga ikut menyala begitu penulis soft-delete baru muncul.
 *
 * Pengecualian yang disengaja: `bulk.actions.ts` memakai dispatch dinamis
 * (`prisma[modelName].updateMany`), jadi bentuk itu tak terpindai. Himpunan
 * yang HANYA bisa dihapus lunak lewat hapus massal karena itu tak terdeteksi —
 * dan saat ini kosong: keempat model yang terjangkau hapus massal (customer,
 * item, vendor, warehouse) juga punya penulis `deletedAt` eksplisit di
 * `master.actions.ts`.
 */
export const ROOT = path.resolve(__dirname, "../../..")
const SCHEMA = path.join(ROOT, "prisma/schema.prisma")
const WRITER_DIRS = [path.join(ROOT, "src/actions"), path.join(ROOT, "src/lib")]

export function walk(dir: string, accept: (name: string) => boolean): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue
      out.push(...walk(full, accept))
    } else if (accept(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** Indeks `}` yang menutup `{` di posisi `open`. -1 bila tak seimbang. */
export function matchingBrace(source: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === "\\") i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Indeks `)` yang menutup `(` di posisi `open`. -1 bila tak seimbang. */
export function matchingParen(source: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === "\\") i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "(") depth++
    else if (ch === ")") {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Lewati komentar `//` dan `/* *\/` pada posisi `i` (di luar string).
 * Prisma/TS yang ditulis manusia memuat komentar DI DALAM objek argumen, dan
 * tanpa ini pemindai berhenti di kunci pertama sesudahnya: `topLevelValues`
 * melihat `// …,` sebagai awal skalar sehingga `where` tak pernah terbaca —
 * persis yang membuat `project-pl-data.ts` dituduh meski filternya ada.
 */
function skipComment(source: string, i: number): number {
  if (source[i] !== "/") return i
  if (source[i + 1] === "/") {
    const newline = source.indexOf("\n", i)
    return newline === -1 ? source.length : newline
  }
  if (source[i + 1] === "*") {
    const close = source.indexOf("*/", i + 2)
    return close === -1 ? source.length : close + 2
  }
  return i
}

/**
 * Nilai sebuah kunci TINGKAT-ATAS di dalam objek literal, sebagai teks mentah.
 *
 * Sengaja bukan regex atas seluruh blok: `select: { deletedAt: true }` di
 * dalam include bersarang akan cocok dengan pola naif dan membuat model
 * berhapus keras tampak seperti penulis tombstone (persis yang dulu membuat
 * pemindaian pertama salah menuduh `salesInvoice`).
 */
export function topLevelValues(objectText: string): Map<string, string> {
  const values = new Map<string, string>()
  const end = objectText.length - 1
  let i = 1
  while (i < end) {
    // Spasi DAN komentar, bergantian: komentar biasanya didahului newline,
    // jadi memeriksa komentar hanya di depan loop tidak cukup.
    let skipped = true
    while (skipped && i < end) {
      skipped = false
      while (i < end && /[\s,]/.test(objectText[i])) {
        i++
        skipped = true
      }
      const afterComment = skipComment(objectText, i)
      if (afterComment !== i) {
        i = afterComment
        skipped = true
      }
    }
    const keyMatch = /^([A-Za-z_$][\w$]*)\s*:/.exec(objectText.slice(i, end))
    if (!keyMatch) break
    const key = keyMatch[1]
    let v = i + keyMatch[0].length
    while (v < end && /\s/.test(objectText[v])) v++
    if (objectText[v] === "{") {
      const close = matchingBrace(objectText, v)
      if (close === -1) break
      values.set(key, objectText.slice(v, close + 1))
      i = close + 1
    } else {
      // Skalar/array hingga koma tingkat-atas.
      let k = v
      let depth = 0
      let quote: string | null = null
      for (; k < end; k++) {
        const ch = objectText[k]
        if (quote) {
          if (ch === "\\") k++
          else if (ch === quote) quote = null
          continue
        }
        if (ch === '"' || ch === "'" || ch === "`") quote = ch
        else if ("([{".includes(ch)) depth++
        else if (")]}".includes(ch)) depth--
        else if (ch === "," && depth === 0) break
      }
      values.set(key, objectText.slice(v, k).trim())
      i = k + 1
    }
  }
  return values
}

/** Objek argumen pertama dari satu pemanggilan yang diawali `(` di `open`. */
export function argumentObject(source: string, open: number): string | null {
  const close = matchingParen(source, open)
  if (close === -1) return null
  const brace = source.indexOf("{", open)
  if (brace === -1 || brace > close) return null
  const end = matchingBrace(source, brace)
  if (end === -1 || end > close) return null
  return source.slice(brace, end + 1)
}

/** Model Prisma yang punya kolom `deletedAt` → nama properti di Prisma Client. */
export function schemaSoftModels(): Set<string> {
  const schema = fs.readFileSync(SCHEMA, "utf8")
  const models = new Set<string>()
  for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = match
    if (/^\s*deletedAt\s+\S+/m.test(body)) {
      models.add(name.charAt(0).toLowerCase() + name.slice(1))
    }
  }
  return models
}

/** Model yang benar-benar ditulisi tombstone oleh kode produksi. */
export function writerSoftModels(): Set<string> {
  const writers = new Set<string>()
  const files = WRITER_DIRS.flatMap((dir) => walk(dir, (n) => n.endsWith(".ts")))
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8")
    for (const match of source.matchAll(/\b(?:tx|prisma)\.(\w+)\.(?:update|updateMany)\(/g)) {
      const open = (match.index ?? 0) + match[0].length - 1
      const argObject = argumentObject(source, open)
      if (!argObject) continue
      const data = topLevelValues(argObject).get("data")
      if (!data) continue
      const written = topLevelValues(data).get("deletedAt")
      // `deletedAt: null` adalah RESTORE, bukan tombstone.
      if (written && written !== "null") writers.add(match[1])
    }
  }
  return writers
}

/**
 * `where` sebuah `findMany`/`findFirst`, dengan `where: <identifier>`
 * diselesaikan ke literal `const <identifier> = { ... }` di berkas yang sama.
 * `null` bila argumennya tak punya `where` sama sekali.
 */
export function resolvedWhere(source: string, matchIndex: number, args: string): string | null {
  const inline = topLevelValues(args).get("where")
  // `where: employeeWhere` terbaca sebagai skalar; nama variabel itu yang
  // harus diselesaikan ke literalnya, bukan dikembalikan apa adanya.
  const bareIdentifier = inline && /^[A-Za-z_$][\w$]*$/.test(inline) ? inline : null
  if (inline && !bareIdentifier) return inline
  const shorthand = /\{\s*where\s*(?:,|\})/.test(args)
  const named = /\bwhere\s*:\s*([A-Za-z_$][\w$]*)\s*(?:,|\}|$)/.exec(args)
  // `findMany({ where, orderBy })` adalah singkatan dari `where: where` —
  // variabelnya bernama `where`. Tanpa ini `identifier` jatuh ke `null` dan
  // setiap pemanggilan bergaya singkat dituduh tak punya filter meski
  // variabelnya menyaring tombstone.
  const identifier = shorthand ? "where" : (bareIdentifier ?? named?.[1] ?? null)
  if (!identifier) return null
  const before = source.slice(0, matchIndex)
  const definitions = [...before.matchAll(new RegExp(`\\bconst\\s+${identifier}\\s*(?::[^=]+)?=\\s*\\{`, "g"))]
  const last = definitions.pop()
  if (!last) return null
  const brace = (last.index ?? 0) + last[0].length - 1
  const end = matchingBrace(source, brace)
  if (end === -1) return null
  return source.slice(brace, end + 1)
}
