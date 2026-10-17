import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative, dirname, resolve } from "node:path"

// Penjaga keterhubungan UI — dua kelas celah yang pernah nyata di repo ini:
//
// 1. MODE SERVER TANPA FILTER. Komponen tabel yang memakai `serverPagination`
//    menulis kata kunci pencarian ke URL (default `?cari=`), dan kontraknya
//    tegas: di mode server pencarian WAJIB menggerakkan query server. Kalau
//    halaman induknya tidak membaca parameter itu, kotak cari terlihat rusak
//    (mengetik tidak menyaring apa pun). Dulu 8 halaman begitu sekaligus.
//
// 2. TAUTAN "BUAT DARI" MATI. UI mengirim `?param=` ke sebuah halaman, tetapi
//    tidak ada apa pun di tujuan (halaman maupun komponen yang direndernya)
//    yang membacanya, sehingga prefill dokumen sumber tidak terjadi. Dulu ada
//    pada surat jalan dari faktur dan faktur dari perintah kerja.
//
// Kedua penjaga bersifat BERARAH DUA: entri daftar-beku yang sudah tidak
// diperlukan lagi akan memerahkan tes, jadi pengecualian tidak bisa menumpuk.

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

const allFiles = walk(APP)
const tsxFiles = allFiles.filter((f) => f.endsWith(".tsx"))
const rel = (f: string) => relative(ROOT, f)

/** Halaman tujuan sebuah URL: buang segmen route group dalam tanda kurung. */
function pageForUrl(urlPath: string): string | null {
  const clean = "/" + urlPath.split("/").filter((s) => s && !s.startsWith("(")).join("/")
  const candidates: string[] = []
  for (const f of allFiles) {
    if (!f.endsWith("page.tsx")) continue
    const route = dirname(relative(APP, f))
      .split("/")
      .filter((s) => s && !s.startsWith("("))
      .join("/")
    const normalized = route ? `/${route}` : "/"
    if (normalized === clean || normalized === clean.replace(/\/$/, "")) candidates.push(f)
  }
  return candidates[0] ?? null
}

/** Berkas .tsx yang relevan untuk sebuah halaman: dirinya, folder _components
 *  di sekitarnya, dan modul yang diimpornya (satu tingkat, agar komponen klien
 *  yang membaca useSearchParams ikut terhitung — pernah jadi positif palsu). */
function filesRelevantTo(pageFile: string): string[] {
  const out = new Set<string>([pageFile])
  const dir = dirname(pageFile)
  for (const f of tsxFiles) {
    if (dirname(f) === dir || dirname(f) === join(dir, "_components")) out.add(f)
  }
  const source = readFileSync(pageFile, "utf8")
  for (const m of source.matchAll(/from\s+"([^"]+)"/g)) {
    const spec = m[1]
    let target: string | null = null
    if (spec.startsWith("@/")) target = join(ROOT, "src", spec.slice(2))
    else if (spec.startsWith(".")) target = resolve(dir, spec)
    if (!target) continue
    for (const ext of [".tsx", ".ts"]) {
      if (existsSync(target + ext)) out.add(target + ext)
    }
  }
  return [...out]
}

/** Semua tautan internal ber-parameter yang dikirim UI. */
function parameterizedLinks(): Array<{ from: string; line: number; base: string; params: string[] }> {
  const found: Array<{ from: string; line: number; base: string; params: string[] }> = []
  for (const f of tsxFiles) {
    const txt = readFileSync(f, "utf8")
    for (const m of txt.matchAll(/href=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
      const url = [m[1], m[2], m[3]].find((g): g is string => typeof g === "string" && g.length > 0)
      if (!url || !url.startsWith("/") || !url.includes("?")) continue
      const [base, query] = url.split("?")
      const params = [...new Set([...query.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=/g)].map((p) => p[1]))]
      if (params.length === 0) continue
      found.push({ from: rel(f), line: txt.slice(0, m.index).split("\n").length, base, params })
    }
  }
  return found
}

// Entri daftar-beku: kunci = "<url>|<param>", nilai = alasan tertulis.
// Hanya berisi pelanggaran yang BELUM diperbaiki. Entri di sini wajib dibuang
// begitu perbaikannya mendarat — kalau tidak, tes "tidak membusuk" memerahkan.
const LINKS_PENDING: Record<string, string> = {
  // Dua tautan yang dulu tercatat di sini sudah ditutup: `?fakturPenjualanId=`
  // (faktur → surat jalan) kini dibaca surat-jalan/tambah, dan `?quotationId=`
  // (perintah kerja → faktur) kini dibaca faktur/tambah dengan menerjemahkan
  // penawaran ke pesanan penjualannya. Daftar kosong = tidak ada tautan
  // "buat dari" yang mati.
}

// Entri daftar-beku untuk pemeriksaan mode server.
const SERVER_SEARCH_ALLOWED: Record<string, string> = {}

describe("keterhubungan UI: tautan ber-parameter", () => {
  const links = parameterizedLinks()

  it("setiap ?param= yang dikirim UI benar-benar dibaca halaman tujuan", () => {
    const broken: string[] = []
    for (const { from, line, base, params } of links) {
      const page = pageForUrl(base)
      if (!page) continue
      const relevant = filesRelevantTo(page)
      const body = relevant.map((f) => readFileSync(f, "utf8")).join("\n")
      const unread = params.filter((p) => !new RegExp(`\\b${p}\\b`).test(body))
      if (unread.length === 0) continue
      const key = `${base}|${unread[0]}`
      if (LINKS_PENDING[key]) continue
      broken.push(`${base} (param: ${unread.join(", ")}) dikirim ${from}:${line} tujuan ${rel(page)}`)
    }
    expect(broken).toEqual([])
  })

  it("entri daftar-beku tautan tidak membusuk (pelanggarannya sudah hilang)", () => {
    const stale: string[] = []
    for (const key of Object.keys(LINKS_PENDING)) {
      const [base, param] = key.split("|")
      const stillSent = links.some(({ base: b, params }) => b === base && params.includes(param))
      if (!stillSent) {
        stale.push(`${key}: tautannya sudah tidak dikirim lagi — entri bisa dibuang`)
        continue
      }
      const page = pageForUrl(base)
      if (!page) continue
      const body = filesRelevantTo(page).map((f) => readFileSync(f, "utf8")).join("\n")
      if (new RegExp(`\\b${param}\\b`).test(body)) {
        stale.push(`${key}: parameter sudah dibaca tujuan — entri bisa dibuang`)
      }
    }
    expect(stale).toEqual([])
  })

  it("mendeteksi tautan mati bila ada (kontrol positif)", () => {
    // Kontrol: pastikan pendeteksi memang melihat tautan ber-parameter, supaya
    // tes di atas tidak pernah hijau hanya karena regex-nya tidak cocok.
    expect(links.length).toBeGreaterThan(20)
  })
})

describe("keterhubungan UI: kotak cari mode server", () => {
  const tableComponents = tsxFiles.filter((f) => {
    if (!f.includes("_components")) return false
    return readFileSync(f, "utf8").includes("serverPagination")
  })

  it("halaman induk tabel mode server membaca parameter pencariannya", () => {
    const broken: string[] = []
    for (const comp of tableComponents) {
      const page = join(dirname(dirname(comp)), "page.tsx")
      if (!existsSync(page)) continue
      const body = readFileSync(page, "utf8")
      const searchParam = readFileSync(comp, "utf8").match(/searchParam="([^"]+)"/)?.[1] ?? "cari"
      if (new RegExp(`\\b${searchParam}\\b`).test(body)) continue
      if (SERVER_SEARCH_ALLOWED[rel(page)]) continue
      broken.push(`${rel(page)} tidak membaca ?${searchParam}= (tabel: ${rel(comp)})`)
    }
    expect(broken).toEqual([])
  })

  it("kontrol positif: ada cukup banyak tabel mode server untuk diperiksa", () => {
    expect(tableComponents.length).toBeGreaterThan(30)
  })
})
