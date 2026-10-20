import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "path"

/**
 * Penjaga kontrak error API di sisi KONSUMEN.
 *
 * Server (semua route di src/app/api/**) membalas kegagalan lewat apiError()
 * dari @/lib/api-response: `{ error: { code, message } }` — `error` adalah
 * OBJECT, bukan string. Klien yang menulis `showError(data.error)` /
 * `new Error(data.error)` meneruskan object itu ke toast/Error, yang tampil
 * sebagai "[object Object]": pesan asli server ("Akses ditolak", "Format
 * file tidak didukung", …) hilang tanpa satu pun error.
 *
 * proxy-api-error-contract.test.ts menjaga sisi SERVER (proxy.ts); penjaga
 * ini menjaga sisi sebaliknya: tidak ada berkas produksi yang boleh membaca
 * `.error` dari body JSON respons fetch sebagai string. Pembacaan wajib lewat
 * apiErrorMessage() dari @/lib/utils/api-error-message, yang membaca
 * `error.message` (dan tetap menerima bentuk warisan string).
 *
 * Berarah dua: pelanggaran baru memerahkan; daftar berkas terkunci di bawah
 * berhenti memakai helper juga memerahkan (lewat tes ketiga).
 */
const ROOTS = ["src/components", "src/app"]
const HELPER = "src/lib/utils/api-error-message.ts"

// Berkas yang WAJIB memakai helper (dulu membaca data.error langsung).
const LOCKED_CONSUMERS = [
  "src/components/ui/print-button.tsx",
  "src/components/ui/form-attachment-upload.tsx",
  "src/components/ui/transaction-attachments.tsx",
  "src/components/forms/profile-form.tsx",
  "src/components/forms/vendor-payment-form.tsx",
  "src/components/forms/item-form.tsx",
]

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
}

function allSources(): string[] {
  const out: string[] = []
  for (const root of ROOTS) walk(join(process.cwd(), root), out)
  return out
}

describe("api error consumer contract", () => {
  const files = allSources()
  const byPath = new Map(files.map((f) => [f, readFileSync(f, "utf-8")]))

  it("pemindaian hidup: korpus besar + konsumen terkunci ada (bukan hijau hampa)", () => {
    expect(files.length).toBeGreaterThan(200)
    for (const locked of LOCKED_CONSUMERS) {
      expect(byPath.has(join(process.cwd(), locked)), locked).toBe(true)
    }
    expect(readFileSync(join(process.cwd(), HELPER), "utf-8")).toContain(
      "export function apiErrorMessage",
    )
  })

  it("tidak ada konsumen fetch API yang membaca .error dari body sebagai string", () => {
    // Hanya berkas yang benar-benar fetch("/api/...") yang terikat kontrak
    // apiError. `data.error` di luar itu (mis. hasil server action
    // `{ success, error: string }` di payroll-form) adalah kontrak LAIN yang
    // sah — jangan divonis.
    const offenders: string[] = []
    for (const [file, src] of byPath) {
      if (!src.includes("data.error")) continue
      const callsApi = src.includes('fetch("/api/') || src.includes("fetch(`/api/")
      if (callsApi) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it("konsumen terkunci membaca pesan lewat apiErrorMessage", () => {
    for (const locked of LOCKED_CONSUMERS) {
      const src = byPath.get(join(process.cwd(), locked)) ?? ""
      expect(src, locked).toContain("apiErrorMessage(")
      expect(src, locked).not.toContain("data.error")
    }
  })
})
