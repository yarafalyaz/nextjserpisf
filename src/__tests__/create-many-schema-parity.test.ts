import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * Guard: setiap kunci literal di `createMany({ data: … })` harus benar-benar
 * kolom model Prisma yang dituju.
 *
 * Alasan nyata: `updateSalesInvoice` menulis `sortOrder` ke
 * `SalesInvoiceItem`, padahal model itu tidak punya kolom tersebut. Prisma
 * menolak SELURUH panggilan di runtime ("Unknown argument `sortOrder`"), jadi
 * setiap penyimpanan item faktur gagal — sementara `tsc` diam (argumennya
 * `XOR<CreateManyInput>`, dan excess-property check mati di union) dan seluruh
 * unit test lolos karena Prisma-nya di-mock. Kelas cacat ini tidak bisa
 * ditangkap tsc maupun tes ber-mock, hanya oleh pemeriksaan schema langsung.
 *
 * Kontrak yang diperiksa sengaja SEMPIT supaya tidak memerah karena hal yang
 * bukan cacat:
 * - hanya kunci literal langsung (`{ itemId, qty }`) dan objek yang di-`return`
 *   dari callback `data.map((x) => ({ … }))`;
 * - bernilai literal/identifier — pasangan `if (x) payload.k = v` diabaikan;
 * - `data` yang memuat spread atau berisi variabel non-literal dilewati,
 *   karena kuncinya tidak bisa dibuktikan dari teks.
 * Korpus = kode produksi (`src`, tanpa `__tests__`), sama seperti guard schema
 * lain: fixture tes tidak boleh menyembunyikan cacat produksi.
 */
const ROOT = process.cwd()
const SRC = path.join(ROOT, "src")

/** Model Prisma → himpunan nama field skalar/enum yang boleh ditulis. */
function schemaColumns(): Map<string, Set<string>> {
  const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8")
  const models = new Map<string, Set<string>>()
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm
  for (const m of schema.matchAll(modelRe)) {
    const [, name, body] = m
    const fields = new Set<string>()
    for (const raw of body.split("\n")) {
      const line = raw.trim()
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue
      const field = /^(\w+)\s+(\S+)/.exec(line)
      if (!field) continue
      // Relasi punya tipe model, bukan tipe Prisma skalar — kuncinya tetap
      // ditulis lewat `connect`, tapi nama field relasi tak pernah jadi kunci
      // data createMany; yang dipakai adalah kolom FK skalar di baris lain.
      fields.add(field[1])
    }
    models.set(name, fields)
  }
  return models
}

const MODELS = schemaColumns()

/** `salesInvoiceItem` → `SalesInvoiceItem` (delegate Prisma = nama model camelCase). */
function modelNameFor(delegate: string): string | undefined {
  const wanted = delegate.replace(/[^a-z0-9]/gi, "").toLowerCase()
  for (const name of MODELS.keys()) {
    if (name.toLowerCase() === wanted) return name
  }
  return undefined
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue
      collectFiles(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

interface Finding {
  file: string
  line: number
  model: string
  key: string
}

/** Apakah node adalah literal objek dengan kunci yang bisa dibaca statis. */
function literalKeys(node: ts.Node): string[] | null {
  // Kadang callback mengembalikan `({ … } as Something)`.
  let target = node
  while (ts.isParenthesizedExpression(target) || ts.isAsExpression(target) || ts.isSatisfiesExpression(target)) {
    target = target.expression
  }
  if (!ts.isObjectLiteralExpression(target)) return null
  const keys: string[] = []
  for (const prop of target.properties) {
    if (ts.isSpreadAssignment(prop)) return null // kunci tak terbaca statis
    if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
      keys.push(prop.name.text)
    }
  }
  return keys
}

/**
 * Objek data dari argumen `createMany`: literal langsung, atau badan callback
 * `map/forEach` yang mengembalikan literal objek.
 */
function dataKeys(node: ts.Expression): string[] | null {
  const direct = literalKeys(node)
  if (direct) return direct
  if (ts.isArrayLiteralExpression(node) && node.elements.length > 0) {
    return literalKeys(node.elements[0])
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression
    if (ts.isPropertyAccessExpression(callee) && ["map", "flatMap"].includes(callee.name.text)) {
      for (const arg of node.arguments) {
        const returned = returnedObject(arg)
        if (returned) {
          const keys = literalKeys(returned)
          if (keys) return keys
        }
      }
    }
  }
  return null
}

/** Objek yang di-`return`/diekspresikan langsung oleh body callback. */
function returnedObject(fn: ts.Expression): ts.Expression | null {
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null
  const body = fn.body
  if (!ts.isBlock(body)) return body
  for (const stmt of body.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) return stmt.expression
  }
  return null
}

export function createManyFindings(source: string, fileName = "file.ts"): Finding[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const findings: Finding[] = []

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression
      if (callee.name.text === "createMany") {
        const delegate = ts.isPropertyAccessExpression(callee.expression) ? callee.expression.name.text : ""
        const model = modelNameFor(delegate)
        const columns = model ? MODELS.get(model) : undefined
        if (model && columns) {
          const arg = node.arguments[0]
          if (arg && ts.isObjectLiteralExpression(arg)) {
            const dataProp = arg.properties.find(
              (p): p is ts.PropertyAssignment =>
                ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "data",
            )
            const keys = dataProp ? dataKeys(dataProp.initializer) : null
            if (keys) {
              for (const key of keys) {
                if (!columns.has(key)) {
                  const { line } = sf.getLineAndCharacterOfPosition(dataProp!.getStart(sf))
                  findings.push({ file: fileName, line: line + 1, model, key })
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return findings
}

describe("kunci createMany cocok dengan kolom schema Prisma", () => {
  it("schema terbaca dan model faktur dikenali", () => {
    // Sanity: kalau parser schema rusak, guard ini akan lolos kosong.
    expect(MODELS.get("SalesInvoiceItem")).toBeDefined()
    expect(MODELS.get("SalesInvoiceItem")!.has("serialNumbers")).toBe(true)
    expect(modelNameFor("salesInvoiceItem")).toBe("SalesInvoiceItem")
  })

  it("kunci asing terdeteksi, kunci sah tidak", () => {
    const bad = createManyFindings(
      `
      async function a(tx: any) {
        await tx.salesInvoiceItem.createMany({
          data: [{ salesInvoiceId: 1, sortOrder: 0, serialNumbers: ["A"] }],
        })
      }`,
      "bad.ts",
    )
    expect(bad.map((f) => f.key)).toEqual(["sortOrder"])

    const good = createManyFindings(
      `
      async function b(tx: any) {
        await tx.salesInvoiceItem.createMany({
          data: rows.map((r) => ({ salesInvoiceId: r.id, qty: r.qty })),
        })
      }`,
      "good.ts",
    )
    expect(good).toEqual([])
  })

  it("tidak ada createMany produksi yang menulis kolom di luar schema", () => {
    const findings: Finding[] = []
    for (const file of collectFiles(SRC)) {
      const source = fs.readFileSync(file, "utf8")
      if (!source.includes("createMany")) continue
      findings.push(...createManyFindings(source, path.relative(ROOT, file)))
    }
    expect(findings).toEqual([])
  })
})
