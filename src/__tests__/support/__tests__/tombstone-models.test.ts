import { describe, expect, it } from "vitest"

import { argumentObject, resolvedWhere, topLevelValues } from "../tombstone-models"

/**
 * Penjaga untuk pemindai bersama penjaga tombstone.
 *
 * `tombstone-models` dipakai tiga penjaga (`detail-page-tombstone`,
 * `form-picker-tombstone`, `report-tombstone`), dan cacatnya SELALU berbentuk
 * sama: pemindai berhenti membaca lebih awal lalu menuduh kode yang benar.
 * Tiap kegagalan itu sudah menggigit sekali saat menulis penjaganya —
 * komentar di dalam objek argumen, `where: employeeWhere`, dan singkatan
 * `{ where }` — jadi bentuk-bentuk itu dikunci di sini selagi masih kecil.
 * Penjaga yang salah tuduh akan "diperbaiki" orang berikutnya dengan
 * melonggarkan aturannya; tes ini menjaga agar tidak perlu.
 */

describe("topLevelValues membaca objek argumen Prisma", () => {
  it("membaca kunci tingkat atas", () => {
    const values = topLevelValues(`{ where: { a: 1 }, select: { b: true } }`)
    expect(values.get("where")).toBe("{ a: 1 }")
    expect(values.get("select")).toBe("{ b: true }")
  })

  it("melewati komentar `//` di dalam objek sebelum kunci berikutnya", () => {
    // Bentuk nyatanya di `project-pl-data.ts`: komentar penjelas berada
    // tepat sebelum `where`, dan tanpa pelewatan komentar `where` tak pernah
    // terbaca — berkas yang justru sudah menyaring dituduh.
    const values = topLevelValues(`{
      select: { id: true },
      // Kas kecil yang dibatalkan tetap ada di tabel.
      where: { deletedAt: null },
    }`)
    expect(values.get("where")).toBe("{ deletedAt: null }")
  })

  it("melewati komentar blok `/* */`", () => {
    const values = topLevelValues(`{
      /* dua baris
         komentar */
      where: { isActive: true },
    }`)
    expect(values.get("where")).toBe("{ isActive: true }")
  })

  it("tidak membocorkan kunci bersarang sebagai kunci tingkat atas", () => {
    // `select: { deletedAt: true }` di include bersarang pernah membuat model
    // berhapus keras tampak seperti penulis tombstone. Yang dibaca hanya
    // kunci milik objek ini.
    const values = topLevelValues(`{ include: { items: { select: { deletedAt: true } } } }`)
    expect([...values.keys()]).toEqual(["include"])
    expect(values.has("deletedAt")).toBe(false)
  })
})

describe("resolvedWhere menyelesaikan variabel where", () => {
  const source = `const where = { deletedAt: null, status: "posted" }
const employeeWhere = { isActive: true, deletedAt: null }
async function f() {
  await prisma.lead.findMany({ where, orderBy: { createdAt: "desc" } })
  await prisma.employee.findFirst({ where: employeeWhere })
  await prisma.item.findMany({ where })
}`

  /** `args` mentah dari pemanggilan ke-`n` pada pola yang diberikan. */
  function callArgs(pattern: RegExp, n = 0): { args: string; index: number } {
    const matches = [...source.matchAll(new RegExp(pattern.source, "g"))]
    const match = matches[n]
    if (!match) throw new Error(`pola ${pattern} tidak ditemukan`)
    const index = match.index ?? 0
    const args = argumentObject(source, index + match[0].length - 1)
    if (!args) throw new Error("argumen bukan objek literal")
    return { args, index }
  }

  it("singkatan `{ where, orderBy }` diselesaikan, bukan dianggap tanpa filter", () => {
    // `{ where, orderBy: … }` adalah `where: where`. Tanpa penyelesaian ini
    // setiap pemanggilan bergaya singkat dituduh tak punya filter padahal
    // variabelnya menyaring tombstone — persis yang terjadi di
    // `crm/leads/page.tsx`, `keuangan/kas-kecil/page.tsx`, dan 9 halaman
    // daftar lain.
    const { args, index } = callArgs(/prisma\.lead\.findMany\(/)
    const where = resolvedWhere(source, index, args)
    expect(where).toContain("deletedAt: null")
    expect(where).toContain(`status: "posted"`)
  })

  it("singkatan `{ where }` tanpa kunci lain tetap diselesaikan", () => {
    const { args, index } = callArgs(/prisma\.item\.findMany\(/)
    expect(resolvedWhere(source, index, args)).toContain("deletedAt: null")
  })

  it("`where: employeeWhere` diselesaikan ke literal const-nya", () => {
    const { args, index } = callArgs(/prisma\.employee\.findFirst\(/)
    const where = resolvedWhere(source, index, args)
    expect(where).toContain("isActive: true")
    expect(where).toContain("deletedAt: null")
  })

  it("pemanggilan tanpa `where` mengembalikan null", () => {
    // `where` tak ada sama sekali — inilah yang memang harus dituntut
    // penjaga: `findMany` atas model ber-tombstone tanpa saringan apa pun.
    const args = "{ orderBy: { id: 'asc' }, take: 10 }"
    expect(resolvedWhere(source, 0, args)).toBeNull()
  })
})
