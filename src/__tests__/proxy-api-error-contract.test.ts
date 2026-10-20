import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

/**
 * Penjaga kontrak error API di proxy.ts.
 *
 * Semua route handler memakai apiError() dari @/lib/api-response, yang
 * menghasilkan { error: { code, message } }. proxy.ts adalah satu-satunya
 * sumber respons error API yang tidak lewat helper itu: ia menulis
 * { error: "<string>" } mentah untuk 429/401. Klien yang membaca
 * error.code / error.message secara terprogram (kontrak terdokumentasi di
 * api-response.ts) mendapat undefined dari respons proxy.
 *
 * Guard ini memindai proxy.ts dan menuntut setiap NextResponse.json yang
 * membawa status error API memakai bentuk apiError.
 */
describe("proxy API error contract", () => {
  const src = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf-8")

  it("memindai proxy.ts (kontrol positif: penanda respons error ada)", () => {
    expect(src.length).toBeGreaterThan(1000)
    // Penanda yang wajib ada supaya pemindaian di bawah tidak hijau hampa:
    // status kini hidup di STATUS_MAP api-response, jadi penandanya di sini
    // adalah pemanggilan throttling + helper kontraknya sendiri.
    expect(src).toContain("takeRateLimit(")
    expect(src).toContain("apiError(")
  })

  it("tidak ada body error mentah { error: \"<string>\" } di proxy", () => {
    expect(src).not.toMatch(/NextResponse\.json\(\s*\{\s*error:\s*["']/)
  })

  it("respons 429 memakai kode RATE_LIMITED", () => {
    const count = (src.match(/"RATE_LIMITED"/g) ?? []).length
    // 4 titik throttling: /login POST, /api/auth POST, upload, API umum.
    expect(count).toBe(4)
  })

  it("respons 401 API memakai kode UNAUTHORIZED", () => {
    const count = (src.match(/"UNAUTHORIZED"/g) ?? []).length
    expect(count).toBeGreaterThanOrEqual(1)
  })

  it("memakai apiError dari @/lib/api-response", () => {
    expect(src).toContain('from "@/lib/api-response"')
    expect(src).toContain("apiError(")
  })
})
