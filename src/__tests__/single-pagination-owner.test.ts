import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, dirname, relative } from "node:path"

/**
 * Penjaga "satu pemilik paginasi".
 *
 * Sebuah halaman daftar boleh memotong data di server (`skip`/`take` +
 * `count`) ATAU menyerahkan seluruh baris ke tabel mode klien (paginasi di
 * browser) — tidak boleh keduanya. Ketika keduanya terjadi, server hanya
 * mengirim 100 baris sementara tabel klien memaginasi 20 per halaman: baris
 * 21–100 tak terjangkau lewat kontrol tabel, dan tombol "berikutnya" server
 * melompati seluruh sisa halaman itu. Pernah nyata di `keuangan/pengeluaran`,
 * `keuangan/kas-kecil`, dan `keuangan/jurnal` (semua `perPage = 100` vs
 * `pageSize={20}`).
 *
 * Penjaga ini memeriksa halaman daftar (yang menjalankan `skip:` pada query
 * Prisma): tabel komponen yang direndernya wajib mode server
 * (`serverPagination`), bukan paginasi klien (`pageSize={n}` tanpa
 * `serverPagination`).
 */

const ROOT = process.cwd()
const APP = join(ROOT, "src", "app")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const tsxFiles = walk(APP).filter((f) => f.endsWith(".tsx"))
const rel = (f: string) => relative(ROOT, f)

/** Halaman daftar yang memotong baris di server. */
const serverPaginatedPages = tsxFiles.filter((f) => {
  if (!f.endsWith("page.tsx")) return false
  const src = readFileSync(f, "utf8")
  // Halaman detail memuat baris terkait ber-`take` juga; kelas cacat ini
  // spesifik pada daftar yang dipaginasi lewat URL (`skip`).
  return /\bskip:/.test(src) && /\bcount\(/.test(src)
})

/** Komponen tabel yang dirender halaman itu (import dari _components). */
function tableComponentsFor(page: string): string[] {
  const src = readFileSync(page, "utf8")
  const dir = dirname(page)
  const comps: string[] = []
  for (const m of src.matchAll(/import \{ (\w+) \} from "\.\/(_components\/[^"]+)"/g)) {
    const name = m[1]
    const spec = m[2]
    for (const ext of [".tsx"]) {
      const target = join(dir, spec + ext)
      if (!existsSync(target)) continue
      const body = readFileSync(target, "utf8")
      if (new RegExp(`export function ${name}\\b`).test(body)) comps.push(target)
    }
  }
  return comps
}

describe("satu pemilik paginasi: halaman daftar server tidak memakai tabel paginasi klien", () => {
  it("setiap tabel di halaman ber-`skip:` memakai serverPagination", () => {
    const broken: string[] = []
    for (const page of serverPaginatedPages) {
      for (const comp of tableComponentsFor(page)) {
        const body = readFileSync(comp, "utf8")
        if (body.includes("serverPagination")) continue
        // Tabel klien tanpa paginasi internal (mis. daftar kecil) tidak
        // memotong apa pun — tidak ada baris yang tak terjangkau.
        const clientPaged = /pageSize=\{\d+\}/.test(body)
        if (!clientPaged) continue
        broken.push(
          `${rel(page)} memotong baris di server tetapi ${rel(comp)} memaginasi sendiri (pageSize=… tanpa serverPagination)`,
        )
      }
    }
    expect(broken).toEqual([])
  })

  it("kontrol positif: ada cukup banyak halaman ber-`skip:` untuk diperiksa", () => {
    expect(serverPaginatedPages.length).toBeGreaterThan(30)
  })

  it("kontrol positif: detektor mengenali tabel paginasi klien", () => {
    const pagesWithTables = serverPaginatedPages.filter(
      (p) => tableComponentsFor(p).length > 0,
    )
    expect(pagesWithTables.length).toBeGreaterThan(15)
  })
})
