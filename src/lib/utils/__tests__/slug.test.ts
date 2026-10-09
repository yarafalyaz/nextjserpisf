import { describe, it, expect, vi } from "vitest"
import { slugify, buildUniqueSlug } from "../slug"

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Laptop Asus 14")).toBe("laptop-asus-14")
  })

  it("strips diacritics", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme")
  })

  it("collapses runs of non-alphanumerics into a single hyphen", () => {
    expect(slugify("A  --  B___C")).toBe("a-b-c")
  })

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Halo--  ")).toBe("halo")
  })

  it("removes non-latin characters entirely", () => {
    expect(slugify("PT. Sinar Jaya (Pusat)")).toBe("pt-sinar-jaya-pusat")
  })

  it("returns empty string when nothing is slug-able", () => {
    expect(slugify("!!!")).toBe("")
    expect(slugify("")).toBe("")
    expect(slugify(null)).toBe("")
    expect(slugify(undefined)).toBe("")
  })

  it("handles document numbers", () => {
    expect(slugify("INV/2026/0001")).toBe("inv-2026-0001")
  })
})

describe("buildUniqueSlug", () => {
  it("returns the slugified base when free", async () => {
    const isTaken = vi.fn().mockResolvedValue(false)
    expect(await buildUniqueSlug("Avanza", isTaken)).toBe("avanza")
    expect(isTaken).toHaveBeenCalledWith("avanza")
  })

  it("appends -2, -3 on collision", async () => {
    const taken = new Set(["avanza", "avanza-2", "avanza-3"])
    const isTaken = async (c: string) => taken.has(c)
    expect(await buildUniqueSlug("Avanza", isTaken)).toBe("avanza-4")
  })

  it("falls back to the fallback stem when base is empty", async () => {
    const isTaken = vi.fn().mockResolvedValue(false)
    expect(await buildUniqueSlug("!!!", isTaken, "INV-1")).toBe("inv-1")
  })

  it("uses 'item' when both base and fallback are empty", async () => {
    const isTaken = vi.fn().mockResolvedValue(false)
    expect(await buildUniqueSlug("", isTaken, "")).toBe("item")
  })
})
