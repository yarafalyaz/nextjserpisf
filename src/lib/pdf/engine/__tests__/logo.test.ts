import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resolveDocumentLogo } from "../logo"

/**
 * companyLogo adalah string bebas dari pengaturan (manage_settings), tetapi
 * fetch-nya dipicu user berizin lebih rendah lewat /api/pdf. Tanpa allowlist
 * origin, nilai itu menjadi blind SSRF GET ke layanan internal (169.254.x,
 * localhost, host intranet) setiap laporan PDF dicetak.
 *
 * Jalur sah yang harus tetap hidup:
 *  - path relatif "/api/uploads/logos/..." (driver lokal) terhadap origin app
 *  - URL absolut di assetBaseUrl terkonfigurasi (CDN/R2 publik)
 *  - data: URL
 * Semua host lain ditolak sebelum fetch.
 */

// PNG 1x1 valid.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
)

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    headers: { get: (name: string) => (name === "content-type" ? "image/png" : null) },
    arrayBuffer: async () => PNG_1X1.buffer.slice(PNG_1X1.byteOffset, PNG_1X1.byteOffset + PNG_1X1.byteLength),
  })
  vi.stubGlobal("fetch", fetchMock)
  delete process.env.NEXT_PUBLIC_ASSET_BASE_URL
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ORIGIN = "https://erp.example.com"

describe("resolveDocumentLogo allowlist origin", () => {
  it("menolak host arbitrer (metadata IP) tanpa fetch", async () => {
    const logo = await resolveDocumentLogo("http://169.254.169.254/latest/meta-data/logo.png", ORIGIN)
    expect(logo).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("menolak localhost tanpa fetch", async () => {
    const logo = await resolveDocumentLogo("http://localhost:3001/internal.png", ORIGIN)
    expect(logo).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("menolak URL absolut tanpa origin yang diketahui", async () => {
    const logo = await resolveDocumentLogo("https://cdn.example.com/logo.png", undefined)
    expect(logo).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("path relatif diambil terhadap origin app", async () => {
    const logo = await resolveDocumentLogo("/api/uploads/logos/logo-1.png", ORIGIN)
    expect(logo).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://erp.example.com/api/uploads/logos/logo-1.png")
  })

  it("URL absolut satu origin dengan app diterima", async () => {
    const logo = await resolveDocumentLogo("https://erp.example.com/api/uploads/logos/logo-1.png", ORIGIN)
    expect(logo).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("URL di assetBaseUrl eksplisit diterima", async () => {
    const logo = await resolveDocumentLogo(
      "https://cdn.yarasoft.net/logos/logo-1.png",
      ORIGIN,
      "https://cdn.yarasoft.net",
    )
    expect(logo).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("URL di NEXT_PUBLIC_ASSET_BASE_URL diterima", async () => {
    process.env.NEXT_PUBLIC_ASSET_BASE_URL = "https://cdn.yarasoft.net/"
    const logo = await resolveDocumentLogo("https://cdn.yarasoft.net/logos/logo-1.png", ORIGIN)
    expect(logo).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("redirect tidak diikuti (origin lolos pun tak boleh melompat host)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 302, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) })
    const logo = await resolveDocumentLogo("/api/uploads/logos/logo-1.png", ORIGIN)
    expect(logo).toBeNull()
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" })
  })

  it("data URL tetap diterima tanpa fetch", async () => {
    const logo = await resolveDocumentLogo(`data:image/png;base64,${PNG_1X1.toString("base64")}`, ORIGIN)
    expect(logo).not.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
