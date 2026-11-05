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

/** Semua tautan internal ber-parameter yang dikirim UI secara literal. */
// Entri daftar-beku: kunci = "<url>|<param>", nilai = alasan tertulis.
function parameterizedLinks(): Array<{ from: string; line: number; base: string; params: string[] }> {  const found: Array<{ from: string; line: number; base: string; params: string[] }> = []
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

/** Jumlah pemanggilan pembangun URL ber-parameter (`withListParams`,
 *  `listPageHref`) di seluruh UI. Tautan filter/paginasi yang dulu literal
 *  (`?status=`, `?halaman=`) kini dibangun helper ini, jadi kemampuan
 *  detektor harus dinilai atas KEDUA bentuk — bukan hanya literal. */
function builderLinkCount(): number {
  return tsxFiles.reduce((n, f) => {
    const txt = readFileSync(f, "utf8")
    return n + (txt.match(/\b(?:withListParams|listPageHref)\(/g)?.length ?? 0)
  }, 0)
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
    // Tautan filter/paginasi yang dibangun `withListParams`/`listPageHref`
    // tidak muncul sebagai literal, jadi keduanya dihitung bersama — kalau
    // tidak, memindahkan tautan ke builder akan memerahkan kontrol ini tanpa
    // ada regresi keterhubungan.
    expect(links.length + builderLinkCount()).toBeGreaterThan(20)
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
      // Harus DIBACA dari loader (`params.<param>`), bukan sekadar kata yang
      // muncul di nama tipe/placeholder — dulu `cari?: string` di anotasi
      // searchParams sudah cukup membuat penjaga hijau meski nilainya tak dipakai.
      if (new RegExp(`\\b(?:params|searchParams)\\.${searchParam}\\b`).test(body)) continue
      if (SERVER_SEARCH_ALLOWED[rel(page)]) continue
      broken.push(`${rel(page)} tidak membaca ?${searchParam}= (tabel: ${rel(comp)})`)
    }
    expect(broken).toEqual([])
  })

  it("kontrol positif: ada cukup banyak tabel mode server untuk diperiksa", () => {
    expect(tableComponents.length).toBeGreaterThan(30)
  })
})

describe("keterhubungan UI: chip filter mempertahankan pencarian", () => {
  // Kelas cacat yang dulu lolos di 26 halaman: chip filter membangun ulang URL
  // dari nol (`href={/x${status ? `?status=${status}` : ""}}`), sehingga
  // mengklik "Disetujui" saat kotak cari berisi "INV-001" membuang `?cari=`.
  // Halaman tetap bekerja, tetapi pencarian pengguna hilang tanpa jejak — dan
  // lebih buruk, chip berikutnya lalu menampilkan hasil yang lebih banyak.
  // Kontraknya: chip pada halaman berkotak cari DIBANGUN helper
  // (`withListParams` / `listPageHref`), bukan dari string kosong.

  /** Potongan tag `<Link …>`: berhenti di `>` luar kuota/`{}` agar atribut
   *  berisi template literal tetap utuh. */
  function linkTags(source: string): string[] {
    const out: string[] = []
    for (let i = source.indexOf("<Link"); i !== -1; i = source.indexOf("<Link", i + 1)) {
      let depth = 0
      let quote: string | null = null
      let j = i + 5
      for (; j < source.length; j++) {
        const ch = source[j]
        if (quote) {
          if (ch === "\\") j++
          else if (ch === quote) quote = null
          continue
        }
        if (ch === '"' || ch === "'" || ch === "`") quote = ch
        else if (ch === "{") depth++
        else if (ch === "}") depth--
        else if (ch === ">" && depth === 0) break
        else if (ch === "<") break
      }
      if (j < source.length && source[j] === ">") out.push(source.slice(i, j + 1))
    }
    return out
  }

  /** Halaman yang menampilkan kotak cari (default `cari`, atau `paramName`). */
  const pagesWithSearch = tsxFiles.filter((f) => {
    if (!f.endsWith("page.tsx")) return false
    const body = readFileSync(f, "utf8")
    return body.includes("AppSearchField") || /\b(?:params|searchParams)\.cari\b/.test(body)
  })

  it("chip filter di halaman berkotak cari dibangun ulang dari parameter saat ini", () => {
    const broken: string[] = []
    for (const page of pagesWithSearch) {
      const body = readFileSync(page, "utf8")
      for (const tag of linkTags(body)) {
        if (!tag.includes("filter-chip")) continue
        if (/\b(?:withListParams|listPageHref)\(/.test(tag)) continue
        // Href yang sudah dirakit di variabel (mis. `href={chip.href}` dari
        // array `filterChips`) tidak memperlihatkan builder di tag-nya, jadi
        // yang diperiksa berkasnya: builder harus dipakai, dan tidak boleh ada
        // `href:` di objek mana pun yang menyusun query dari nol.
        const href = tag.match(/\bhref=\{([^}]*)\}/)?.[1]?.trim()
        if (href && /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/.test(href)) {
          const rawObjectHref = /href:\s*`[^`]*\?/.test(body) || /href:\s*`\$\{[^}]*\}\?/.test(body)
          if (/\b(?:withListParams|listPageHref)\(/.test(body) && !rawObjectHref) continue
        }
        broken.push(`${rel(page)}: ${tag.replace(/\s+/g, " ").slice(0, 120)}`)
      }
    }
    expect(broken).toEqual([])
  })

  it("kontrol positif: chip filter benar-benar terdeteksi pada cukup banyak halaman", () => {
    const pages = pagesWithSearch.filter((p) =>
      linkTags(readFileSync(p, "utf8")).some((t) => t.includes("filter-chip")),
    )
    expect(pages.length).toBeGreaterThan(20)
  })
})

describe("keterhubungan UI: setiap kotak cari halaman dibaca halamannya", () => {
  // Kelas cacat yang dulu lolos: `<AppSearchField action="/x" />` menulis
  // `?cari=` tetapi halaman `/x` tidak membacanya — kotak cari tampak ada dan
  // responsif, tetapi daftar tidak pernah menyaring. Penjaga di atas hanya
  // melihat tabel ber-`serverPagination`, sehingga tabel mode klien (paginasi
  // di browser) tidak pernah diperiksa.
  const pagesWithSearchField = tsxFiles.filter(
    (f) => f.endsWith("page.tsx") && readFileSync(f, "utf8").includes("AppSearchField"),
  )

  it("halaman yang merender AppSearchField membaca parameter yang ditulisnya", () => {
    const broken: string[] = []
    for (const page of pagesWithSearchField) {
      const body = readFileSync(page, "utf8")
      // Parameter yang ditulis kotak cari: default `cari`, atau `paramName="…"`.
      const params = [...body.matchAll(/<AppSearchField[^>]*?paramName="([^"]+)"/g)].map((m) => m[1])
      const effective = params.length > 0 ? params : ["cari"]
      for (const param of new Set(effective)) {
        // Enum/for-loop yang menyusun filter tidak relevan; yang dicari adalah
        // pembacaan `params.<param>` / `searchParams.<param>` di loader.
        if (new RegExp(`\\b(?:params|searchParams)\\.${param}\\b`).test(body)) continue
        broken.push(`${rel(page)} merender AppSearchField tetapi tidak membaca ?${param}=`)
      }
    }
    expect(broken).toEqual([])
  })

  it("kontrol positif: ada cukup banyak halaman berkotak cari untuk diperiksa", () => {
    expect(pagesWithSearchField.length).toBeGreaterThan(20)
  })
})
