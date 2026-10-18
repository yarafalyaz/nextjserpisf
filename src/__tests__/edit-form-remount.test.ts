import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga: form yang diisi dari parameter `?edit<X>=` WAJIB di-remount dengan `key`.
 *
 * Sebabnya nyata dan sudah terjadi dua kali. Form di halaman ini memakai input TAK
 * TERKENDALI (`defaultValue`). Saat pemakai menekan "Ubah", halaman berpindah lewat
 * navigasi KLIEN ke rute yang sama dengan searchParams berbeda. React memakai ulang
 * komponen form yang sudah ter-mount di posisi yang sama, sehingga `defaultValue`
 * TIDAK pernah diterapkan lagi: form tampil dengan nilai lama (sering kosong), dan
 * menyimpan akan MENIMPA data yang ada dengan nilai kosong itu — kelas "mengubah
 * menghapus data".
 *
 * `key` yang berubah mengikuti id entitas memaksa React membuang instance lama dan
 * membuat yang baru, sehingga `defaultValue` benar-benar dipakai. Tanpa `key`,
 * prefill bukan prefill — ia hanya kebetulan benar pada muat halaman pertama.
 */
function pagesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...pagesUnder(full))
    else if (entry === "page.tsx") out.push(full)
  }
  return out
}

/**
 * Elemen JSX yang menerima nilai dari variabel `editing…` (yaitu mode ubah).
 *
 * Nilai prop di berkas ini bertingkat kurawal (`holiday={editing ? {...} : undefined}`),
 * jadi regex sederhana tidak cukup: atributnya dipindai dengan menghitung kedalaman
 * kurawal sampai menemukan `>` pada kedalaman nol.
 */
function editingFormTags(source: string): { tag: string; hasKey: boolean }[] {
  const found: { tag: string; hasKey: boolean }[] = []
  const tagRe = /<([A-Z][A-Za-z0-9]*)/g
  let match: RegExpExecArray | null
  while ((match = tagRe.exec(source))) {
    const start = tagRe.lastIndex
    let depth = 0
    let end = start
    for (; end < source.length; end++) {
      const char = source[end]
      if (char === "{") depth++
      else if (char === "}") depth--
      else if (char === ">" && depth === 0) break
    }
    const attrs = source.slice(start, end)
    if (!/\bediting[A-Za-z]*\b/.test(attrs)) continue
    found.push({ tag: match[1], hasKey: /(^|\s)key=/.test(attrs) })
    tagRe.lastIndex = end
  }
  return found
}

describe("form ubah wajib di-remount (key)", () => {
  const pages = pagesUnder("src/app")

  it("menemukan halaman yang merender form ubah (penjaga ini tidak diam-diam kosong)", () => {
    const withEditingForms = pages.filter((p) => editingFormTags(readFileSync(p, "utf8")).length > 0)
    // Bila ini nol, pemindaiannya yang rusak — bukan berarti tidak ada form ubah.
    expect(withEditingForms.length).toBeGreaterThan(0)
  })

  it("setiap form yang diisi dari ?edit<X>= punya prop key", () => {
    const offenders: string[] = []
    for (const page of pages) {
      for (const { tag, hasKey } of editingFormTags(readFileSync(page, "utf8"))) {
        if (!hasKey) offenders.push(`${page} -> <${tag}>`)
      }
    }
    expect(
      offenders,
      `Form ubah tanpa key akan tampil kosong dan menimpa data lama dengan nilai kosong:\n${offenders.join("\n")}`,
    ).toEqual([])
  })
})
