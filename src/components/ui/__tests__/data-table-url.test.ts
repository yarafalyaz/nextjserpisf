import { describe, it, expect } from "vitest"
import { buildServerSearchUrl } from "../data-table-utils"

describe("buildServerSearchUrl (DataTable server-paginated search)", () => {
  it("writes the search value to the configured param and resets halaman", () => {
    const sp = new URLSearchParams("halaman=5&userId=10")
    const res = buildServerSearchUrl(sp, "cari", "invoice")
    expect(res).toBe("userId=10&cari=invoice")
  })

  it("drops the search param entirely when input is empty (no stale ?cari=)", () => {
    const sp = new URLSearchParams("halaman=2&cari=old")
    const res = buildServerSearchUrl(sp, "cari", "")
    expect(res).toBe("halaman=2")
  })

  it("drops the search param when input is whitespace-only", () => {
    const sp = new URLSearchParams("halaman=2&cari=old")
    const res = buildServerSearchUrl(sp, "cari", "   ")
    expect(res).toBe("halaman=2")
  })

  it("preserves other unrelated query params", () => {
    const sp = new URLSearchParams("pageSize=50&action=create&halaman=3")
    const res = buildServerSearchUrl(sp, "q", "  PO  ")
    // Trims surrounding whitespace, keeps internal spaces.
    expect(res).toBe("pageSize=50&action=create&q=PO")
  })

  it("supports a custom search-param name (e.g. 'q' instead of 'cari')", () => {
    const sp = new URLSearchParams("halaman=1")
    const res = buildServerSearchUrl(sp, "q", "barang")
    expect(res).toBe("q=barang")
  })
})
