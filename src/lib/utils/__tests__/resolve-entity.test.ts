import { describe, it, expect, vi } from "vitest"
import { resolveEntity } from "../resolve-entity"

describe("resolveEntity", () => {
  it("prefers a slug hit", async () => {
    const record = { id: 1, slug: "avanza" }
    const bySlug = vi.fn().mockResolvedValue(record)
    const byId = vi.fn().mockResolvedValue(null)

    const result = await resolveEntity({ segment: "avanza" }, { bySlug, byId })

    expect(result).toBe(record)
    expect(bySlug).toHaveBeenCalledWith("avanza", {})
    expect(byId).not.toHaveBeenCalled()
  })

  it("falls back to numeric id when slug misses", async () => {
    const record = { id: 39 }
    const bySlug = vi.fn().mockResolvedValue(null)
    const byId = vi.fn().mockResolvedValue(record)

    const result = await resolveEntity({ segment: "39" }, { bySlug, byId })

    expect(result).toBe(record)
    expect(byId).toHaveBeenCalledWith(39, {})
  })

  it("returns null for a non-numeric segment with no slug hit", async () => {
    const bySlug = vi.fn().mockResolvedValue(null)
    const byId = vi.fn()

    const result = await resolveEntity({ segment: "nope" }, { bySlug, byId })

    expect(result).toBeNull()
    expect(byId).not.toHaveBeenCalled()
  })

  it("passes fallbackWhere to both lookups", async () => {
    const bySlug = vi.fn().mockResolvedValue(null)
    const byId = vi.fn().mockResolvedValue({ id: 5 })

    await resolveEntity(
      { segment: "5", fallbackWhere: { deletedAt: null } },
      { bySlug, byId },
    )

    expect(bySlug).toHaveBeenCalledWith("5", { deletedAt: null })
    expect(byId).toHaveBeenCalledWith(5, { deletedAt: null })
  })
})
