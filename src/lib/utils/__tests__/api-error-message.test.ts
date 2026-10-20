import { describe, it, expect } from "vitest"
import { apiErrorMessage } from "../api-error-message"

describe("apiErrorMessage", () => {
  it("membaca pesan dari bentuk kontrak { error: { code, message } }", () => {
    expect(
      apiErrorMessage({ error: { code: "FORBIDDEN", message: "Akses ditolak" } }, "Upload gagal"),
    ).toBe("Akses ditolak")
  })

  it("tidak pernah mengembalikan object (kasus [object Object] di toast)", () => {
    const out = apiErrorMessage(
      { error: { code: "BAD_REQUEST", message: "Format file tidak didukung" } },
      "Upload gagal",
    )
    expect(typeof out).toBe("string")
    expect(out).not.toContain("[object Object]")
  })

  it("membaca bentuk warisan { error: string }", () => {
    expect(apiErrorMessage({ error: "Gagal mengambil data cetak" }, "fallback")).toBe(
      "Gagal mengambil data cetak",
    )
  })

  it("jatuh ke fallback untuk body tanpa error", () => {
    expect(apiErrorMessage({ url: "/x" }, "Upload gagal")).toBe("Upload gagal")
    expect(apiErrorMessage(null, "Upload gagal")).toBe("Upload gagal")
    expect(apiErrorMessage(undefined, "Upload gagal")).toBe("Upload gagal")
  })

  it("jatuh ke fallback untuk pesan kosong / bukan string", () => {
    expect(apiErrorMessage({ error: { code: "X", message: "  " } }, "fb")).toBe("fb")
    expect(apiErrorMessage({ error: { code: "X", message: 42 } }, "fb")).toBe("fb")
    expect(apiErrorMessage({ error: "" }, "fb")).toBe("fb")
  })
})
