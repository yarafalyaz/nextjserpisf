import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guard: field yang ditulis oleh `updateX` tidak boleh dibuang diam-diam oleh
 * `createX` saat keduanya memakai skema validasi yang SAMA.
 *
 * Kelas bug yang dijaga (putaran 121): form faktur mengirim `notes` dan
 * `serialNumbers` per baris ke kedua jalur, `updateSalesInvoice` menyimpannya,
 * tetapi `createSalesInvoice` tidak pernah membacanya dari `parsed.data` —
 * catatan yang diketik saat membuat faktur hilang begitu simpan berhasil, dan
 * nomor seri pilihan operator tidak ikut, sehingga posting `consumeFifoLayers`
 * memilih serial tertua otomatis alih-alih yang benar-benar diserahkan.
 * Tidak tertangkap tsc (field opsional, tidak ada yang menghalangi membuang
 * kunci zod), tidak tertangkap lint, dan tidak tertangkap tes ber-mock selama
 * tesnya hanya memeriksa field yang memang ditulis.
 *
 * Aturan (sengaja longgar supaya tidak berisik): untuk setiap pasangan
 * `createX`/`updateX` di `src/actions/*.ts` yang memanggil `parseFormData`
 * dengan skema yang sama, setiap kunci skema yang DITULIS oleh update
 * (`kunci:`) harus muncul setidaknya sekali sebagai kata di badan create —
 * termasuk helper lokal yang di-spread ke create (`...readXxx(...)`), karena
 * banyak create menitipkan datanya ke helper semacam itu.
 *
 * Batas aturan (jujur): bukti "dipakai" adalah nama kunci muncul sebagai kata
 * di badan fungsi, bukan bukti bahwa nilainya mengalir ke `create`. Bukti
 * positif palsu bisa ada, tetapi kelas yang dijaga adalah kunci yang TIDAK
 * PERNAH disebut sama sekali — persis bentuk `notes`/`serialNumbers` di
 * putaran 121.
 *
 * Berarah dua: menghapus pembacaan kunci dari update membuat pasangan itu
 * hilang dari pemeriksaan, jadi berkas ini juga mematok JUMLAH pasangan yang
 * diperiksa; menambah/mengurangi pasangan tanpa memperbarui patokan akan
 * memerahkan tes.
 */

const ROOT = path.resolve(__dirname, "../..")
const ACTIONS_DIR = path.join(ROOT, "src/actions")
const VALIDATIONS_DIR = path.join(ROOT, "src/lib/validations")

/** Jumlah pasangan create/update berskema-sama saat guard ini dibuat. */
const EXPECTED_PAIRS = 62

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) tsFiles(full, out)
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) out.push(full)
  }
  return out
}

/** Skema zod: nama → daftar kunci; alias `export const A = B;` ikut disalin. */
function zodSchemas(): Map<string, string[]> {
  const schemas = new Map<string, string[]>()
  for (const file of tsFiles(VALIDATIONS_DIR)) {
    const text = fs.readFileSync(file, "utf8")
    for (const m of text.matchAll(/export const (\w+)\s*=\s*z\.object\(\{([\s\S]*?)\n\}\)/g)) {
      schemas.set(m[1], [...m[2].matchAll(/^ {2}(\w+)\s*:/gm)].map((k) => k[1]))
    }
    for (const m of text.matchAll(/export const (\w+)\s*=\s*(\w+)\s*;/g)) {
      const base = schemas.get(m[2])
      if (base && !schemas.has(m[1])) schemas.set(m[1], base)
    }
  }
  return schemas
}

/**
 * Kunci skema efektif untuk nama itu. Jalur update sering memakai alias
 * (`updateSalesInvoiceSchema = createSalesInvoiceSchema`), dan skema boleh
 * didefinisikan di berkas validasi mana pun — identitas yang dibandingkan
 * adalah HIMPUNAN kuncinya, bukan namanya.
 */
function schemaKeys(schemas: Map<string, string[]>, name: string): string[] | null {
  return schemas.get(name) ?? null
}

function sameSchema(schemas: Map<string, string[]>, a: string, b: string): boolean {
  const ka = schemaKeys(schemas, a)
  const kb = schemaKeys(schemas, b)
  if (!ka || !kb || ka.length !== kb.length) return false
  return ka.every((key) => kb.includes(key))
}

/** Badan fungsi top-level `export function name(` / `export async function name(`. */
function functionBody(source: string, name: string): string | null {
  const start = source.search(new RegExp(String.raw`export (?:async )?function ${name}\(`))
  if (start < 0) return null
  const nextStarts = [...source.matchAll(/export (?:async )?function \w+\(/g)]
    .map((m) => m.index ?? 0)
    .filter((i) => i > start)
  const end = nextStarts.length > 0 ? Math.min(...nextStarts) : source.length
  return source.slice(start, end)
}

/** Badan helper lokal (non-export) yang di-spread ke create. */
function helperBodies(source: string, names: string[]): string {
  let out = ""
  for (const name of names) {
    const m = source.match(new RegExp(String.raw`function ${name}\(`))
    if (!m || m.index == null) continue
    const open = source.indexOf("{", m.index + m[0].length - 1)
    if (open < 0) continue
    let depth = 0
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++
      else if (source[i] === "}") {
        depth--
        if (depth === 0) {
          out += source.slice(open, i + 1)
          break
        }
      }
    }
  }
  return out
}

interface Pair {
  create: string
  update: string
  file: string
  schema: string
  missing: string[]
}

function findViolations(): { pairs: Pair[]; violations: Pair[] } {
  const schemas = zodSchemas()
  const pairs: Pair[] = []

  for (const file of tsFiles(ACTIONS_DIR)) {
    const source = fs.readFileSync(file, "utf8")
    const functions = new Map<string, string>()
    for (const m of source.matchAll(/export (?:async )?function (\w+)\(/g)) {
      const body = functionBody(source, m[1])
      if (body) functions.set(m[1], body)
    }

    for (const [name, body] of functions) {
      if (!name.startsWith("create")) continue
      const updater = `update${name.slice("create".length)}`
      const updateBody = functions.get(updater)
      if (!updateBody) continue

      const schema = body.match(/parseFormData\(\s*(\w+)/)?.[1]
      const updateSchema = updateBody.match(/parseFormData\(\s*(\w+)/)?.[1]
      if (!schema || !updateSchema || !sameSchema(schemas, schema, updateSchema)) continue
      const keys = schemaKeys(schemas, schema)
      if (!keys) continue

      // Buang kata-kata yang hanya milik update: harus muncul di create.
      const spreadHelpers = [...body.matchAll(/\.\.\.(\w+)\(/g)].map((m) => m[1])
      const createCorpus = body + helperBodies(source, spreadHelpers)
      const writtenByUpdate = keys.filter((key) =>
        new RegExp(String.raw`^\s*${key}\s*:`, "m").test(updateBody),
      )
      const missing = writtenByUpdate.filter(
        (key) => !new RegExp(String.raw`\b${key}\b`).test(createCorpus),
      )
      pairs.push({
        create: name,
        update: updater,
        file: path.relative(ROOT, file),
        schema,
        missing,
      })
    }
  }

  return { pairs, violations: pairs.filter((p) => p.missing.length > 0) }
}

describe("paritas field create/update berskema sama", () => {
  const { pairs, violations } = findViolations()

  it("tidak ada field yang ditulis update tetapi tak pernah disebut create", () => {
    const report = violations
      .map((p) => `${p.file}: ${p.create} membuang ${p.missing.join(", ")} (${p.update} menulisnya)`)
      .join("\n")
    expect(report, `Field yang dibuang diam-diam oleh jalur create:\n${report}`).toBe("")
  })

  it("jumlah pasangan yang diperiksa tetap (patokan beku)", () => {
    // Berarah dua: kalau pemeriksaan berhenti menemukan pasangan (mis. kunci
    // `parseFormData` di salah satu sisi diubah), tes ini memerah alih-alih
    // diam-diam memeriksa lebih sedikit.
    expect(pairs.length).toBe(EXPECTED_PAIRS)
  })
})
