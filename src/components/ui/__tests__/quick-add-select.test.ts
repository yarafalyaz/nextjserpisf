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

  it("label Wilayah terasosiasi ke grup pemilih alamat", () => {
    // Region branch: label memakai id + role=group + aria-labelledby — bukan
    // <Label> orphan tanpa htmlFor yang tidak diumumkan SR.
    expect(SOURCE).toContain('id={`${inputId}-label`}')
    expect(SOURCE).toContain('role="group"')
    expect(SOURCE).toContain("aria-labelledby={`${inputId}-label`}")
  })

  it("hint/emptyHint terikat ke field via id + aria-describedby", () => {
    // Hint melayang tanpa asosiasi tidak dibacakan SR saat fokus masuk.
    expect(SOURCE).toContain("activeDescribedBy")
    expect(SOURCE).toContain("aria-describedby={activeDescribedBy}")
    expect(SOURCE).toContain("id={hintId}")
    expect(SOURCE).toContain("id={emptyHintId}")
  })

  it("penanda required visual disembunyikan dari SR", () => {
    // Bintang merah hanya dekorasi — wajib/tidaknya diumumkan via
    // aria-required + required, bukan lewat karakter "*".
    expect(SOURCE).toContain('aria-hidden="true"')
    expect(SOURCE).toMatch(/aria-required=\{field\.required \|\| undefined\}/)
  })

  it("select + combobox quick-add meneruskan required", () => {
    // Field wajib yang required-nya hilang diam-diam lolos kosong.
    expect(SOURCE).toContain("required={field.required}")
  })
})
