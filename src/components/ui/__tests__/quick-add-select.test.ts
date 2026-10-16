import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Regresi: dialog quick-add hidup DI DALAM form dokumen (Penawaran, Faktur, Proyek…).
 * Dulu handler submit-nya hanya `preventDefault()`, sehingga event submit naik ke form
 * induk: menyimpan pelanggan/kendaraan baru dari dialog sekaligus MENGIRIM dokumennya.
 * Akibat nyata: 13 penawaran draft kosong tercipta tanpa disadari saat verifikasi.
 *
 * Tes ini menjaga dua hal yang membuat bug itu tidak bisa kembali:
 *  1. submit dialog menghentikan propagasi ke form induk,
 *  2. tombol Batal bukan type="submit".
 */
const SOURCE = fs.readFileSync(
  path.join(process.cwd(), "src/components/ui/quick-add-select.tsx"),
  "utf8",
)

describe("QuickAddSelect — submit tidak menembus form dokumen", () => {
  const handler = (() => {
    const start = SOURCE.indexOf("function handleSubmit")
    const end = SOURCE.indexOf("startTransition", start)
    return start >= 0 && end > start ? SOURCE.slice(start, end) : ""
  })()

  it("menghentikan propagasi submit di dalam handleSubmit", () => {
    expect(handler, "handleSubmit tidak ditemukan").not.toBe("")
    expect(handler).toContain("e.preventDefault()")
    expect(handler).toContain("e.stopPropagation()")
  })

  it("tombol Batal bertipe button, bukan submit", () => {
    expect(SOURCE).toMatch(/type="button"[\s\S]{0,200}Batal/)
  })

  it("form dialog tetap menangani submit lewat handleSubmit", () => {
    expect(SOURCE).toMatch(/<form onSubmit=\{handleSubmit\}/)
  })
})
