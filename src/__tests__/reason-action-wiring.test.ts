import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga: action yang MENOLAK alasan kosong harus dipanggil dari komponen
 * yang benar-benar mengumpulkan alasan.
 *
 * `DeleteButton` memanggil `action(id)` — satu argumen saja. `ActionDropdown`
 * memanggil `action(deleteId, reason)` hanya bila prop `deleteReasonLabel`
 * diisi; tanpa itu ia juga mengirim satu argumen. Jadi action ber-`reason?`
 * yang mensyaratkan alasan non-kosong selalu gagal bila dipasang ke salah
 * satunya tanpa label.
 *
 * Kasus nyata (putaran 229): `deletePettyCash` bukan hapus fisik melainkan
 * void beralasan (GL-BR-003 P6) — ia mengembalikan "Alasan pembatalan kas
 * kecil wajib diisi" sebelum mutasi apa pun. Tombol Hapus di halaman detail
 * dan menu Hapus di tabel sama-sama memakai jalur satu-argumen, sehingga
 * transaksi kas kecil **tidak pernah bisa dibatalkan dari UI**.
 */

const APP = join(process.cwd(), "src/app")
const ACTIONS = join(process.cwd(), "src/actions")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue
      walk(full, out)
    } else if (entry.endsWith(".tsx")) {
      out.push(full)
    }
  }
  return out
}

/**
 * Action yang (a) menerima `reason` sebagai parameter kedua dan (b) benar
 * benar menolak alasan kosong. Yang hanya memakai reason opsional tanpa
 * penolakan tidak masuk daftar — memanggilnya satu argumen tetap sah.
 */
function reasonRequiringActions(): Set<string> {
  const found = new Set<string>()
  for (const file of readdirSync(ACTIONS)) {
    if (!file.endsWith(".ts")) continue
    const src = readFileSync(join(ACTIONS, file), "utf8")
    const fnRe = /export async function (\w+)\(\s*\w+:\s*(?:number|string),\s*(\w+)\?:\s*string\s*\)/g
    for (const m of src.matchAll(fnRe)) {
      const name = m[1]
      const start = m.index ?? 0
      const next = src.indexOf("\nexport ", start)
      const body = src.slice(start, next === -1 ? src.length : next)
      // Dua bentuk yang dipakai repo: `const cleanReason = (reason ?? "").trim()`
      // lalu `if (!cleanReason)`, atau langsung `if (!reason.trim())`.
      // Keduanya harus diikuti penolakan eksplisit (bukan hanya throw) supaya
      // penjaga ini tidak menandai aksi yang alasan kosongnya sah.
      const normalizes = /(\w+)\s*=\s*\(?\s*reason\s*\?\?\s*""\s*\)?\.trim\(\)/.exec(body)
      const guardVar = normalizes ? normalizes[1] : null
      const rejects =
        (guardVar !== null && new RegExp(`!${guardVar}\\b`).test(body)) ||
        /!reason\.trim\(\)/.test(body)
      if (rejects && /success:\s*false/.test(body)) found.add(name)
    }
  }
  return found
}

describe("action beralasan dipanggil dari komponen yang mengumpulkan alasan", () => {
  it("daftar action beralasan tidak vakum", () => {
    const actions = reasonRequiringActions()
    expect(actions.size, "pemindaian tidak menemukan action beralasan — cek regex").toBeGreaterThan(0)
  })

  it("setiap pemakaian DeleteButton/ActionDropdown atas action beralasan membawa alasan", () => {
    const guarded = reasonRequiringActions()
    const offenders: string[] = []

    for (const file of walk(APP)) {
      const src = readFileSync(file, "utf8")

      // DeleteButton: satu argumen — tidak pernah sah untuk action beralasan.
      for (const m of src.matchAll(/<DeleteButton\b[^>]*action=\{(\w+)\}/g)) {
        if (guarded.has(m[1])) {
          offenders.push(
            `${file}: <DeleteButton action={${m[1]}}> memanggil action(id) tanpa alasan — action menolak alasan kosong`,
          )
        }
      }

      // ActionDropdown: sah HANYA bila deleteReasonLabel ada di blok itu.
      for (const m of src.matchAll(/<ActionDropdown\b([\s\S]{0,700}?)\/>/g)) {
        const block = m[1]
        const action = block.match(/deleteAction=\{(\w+)\}/)
        if (!action) continue
        if (!guarded.has(action[1])) continue
        if (!block.includes("deleteReasonLabel")) {
          offenders.push(
            `${file}: <ActionDropdown deleteAction={${action[1]}}> tanpa deleteReasonLabel — action menolak alasan kosong`,
          )
        }
      }
    }

    expect(
      offenders,
      `Action beralasan dipanggil tanpa mengumpulkan alasan:\n${offenders.join("\n")}`,
    ).toEqual([])
  })

  it("kas kecil memakai komponen beralasan di halaman detail dan di tabel", () => {
    // Kasus konkret yang memicu penjaga ini: deletePettyCash = void beralasan.
    const detail = readFileSync(
      join(APP, "(dashboard)/keuangan/kas-kecil/[slug]/page.tsx"),
      "utf8",
    )
    expect(detail).toContain("action={deletePettyCash}")
    expect(detail).toContain("requireReason")
    expect(detail).toContain("canVoid={canVoidPettyCash}")
    expect(detail).toMatch(/hasPermission\("delete_petty_cash"\)/)
    expect(detail).not.toMatch(/<DeleteButton\b[^>]*action=\{deletePettyCash\}/)

    const table = readFileSync(
      join(APP, "(dashboard)/keuangan/kas-kecil/_components/petty-cash-table.tsx"),
      "utf8",
    )
    expect(table).toContain("deleteAction={deletePettyCash}")
    expect(table).toContain('deleteReasonLabel="Alasan pembatalan"')
  })

  it("void beralasan lain di repo tetap memakai jalurnya masing-masing", () => {
    // Ratchet ringan: tiga pemakaian deleteReasonLabel yang sudah ada tidak
    // boleh hilang saat kas kecil diperbaiki.
    const expected: Array<[string, string]> = [
      ["(dashboard)/keuangan/transfer-bank/_components/bank-transfer-table.tsx", "deleteBankTransfer"],
      ["(dashboard)/keuangan/penyetoran-pajak/_components/tax-payment-table.tsx", "deleteTaxPayment"],
      ["(dashboard)/pembelian/uang-muka/_components/purchase-advance-table.tsx", "deletePurchaseAdvance"],
    ]
    for (const [rel, action] of expected) {
      const src = readFileSync(join(APP, rel), "utf8")
      expect(src, `${rel}: ${action} kehilangan deleteReasonLabel`).toContain("deleteReasonLabel")
      expect(src).toContain(`deleteAction={${action}}`)
    }
  })
})
