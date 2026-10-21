import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Kontrak segmen prefill "buat dari" (`tambah/<kunci>/<slug>`), pengganti
 * query `?xxxId=` lama. Redirect/notFound-nya Next dilempar sebagai error
 * sentinel di test ini supaya arah pantulannya bisa diperiksa.
 */

class RedirectSentinel extends Error {
  constructor(public href: string) {
    super(`REDIRECT ${href}`)
  }
}
class NotFoundSentinel extends Error {}

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new RedirectSentinel(href)
  },
  notFound: () => {
    throw new NotFoundSentinel()
  },
}))

import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "../prefill-path"

const canonical = (slug: string) => `/x/tambah/faktur/${slug}`

function fakeDelegate(rows: Array<{ id: number; slug: string | null }>) {
  return {
    findFirst: vi.fn(async ({ where }: any) => {
      const slugCond = where.OR.find((c: any) => c.slug !== undefined)
      const idCond = where.OR.find((c: any) => c.id !== undefined)
      return (
        rows.find(
          (r) =>
            (slugCond && r.slug === slugCond.slug) ||
            (idCond && r.id === idCond.id),
        ) ?? null
      )
    }),
    findMany: vi.fn(async ({ where, take }: any) =>
      rows
        .filter((r) => r.slug?.startsWith(where.slug.startsWith))
        .slice(0, take)
        .map((r) => ({ slug: r.slug })),
    ),
    findUnique: vi.fn(async ({ where }: any) => {
      const row = rows.find((r) => r.id === where.id)
      return row ? { slug: row.slug } : null
    }),
  }
}

describe("parsePrefillSegments", () => {
  it("tanpa segmen → objek kosong", () => {
    expect(parsePrefillSegments(undefined, ["faktur"])).toEqual({})
    expect(parsePrefillSegments([], ["faktur"])).toEqual({})
  })

  it("pasangan kunci/nilai yang dikenal diurai", () => {
    expect(parsePrefillSegments(["faktur", "inv-1", "tipe", "final"], ["faktur", "tipe"])).toEqual({
      faktur: "inv-1",
      tipe: "final",
    })
  })

  it("segmen ganjil → 404", () => {
    expect(() => parsePrefillSegments(["faktur"], ["faktur"])).toThrow(NotFoundSentinel)
  })

  it("kunci tak dikenal atau ganda → 404", () => {
    expect(() => parsePrefillSegments(["asing", "1"], ["faktur"])).toThrow(NotFoundSentinel)
    expect(() =>
      parsePrefillSegments(["faktur", "a", "faktur", "b"], ["faktur"]),
    ).toThrow(NotFoundSentinel)
  })
})

describe("resolvePrefillId", () => {
  const rows = [
    { id: 26, slug: "009-inv-iro-10-2026" },
    { id: 27, slug: "010-inv-iro-10-2026" },
  ]

  beforeEach(() => vi.clearAllMocks())

  it("slug utuh → id tanpa pantulan", async () => {
    await expect(resolvePrefillId(fakeDelegate(rows), "009-inv-iro-10-2026", canonical)).resolves.toBe(26)
  })

  it("id numerik → memantul ke URL slug utuh", async () => {
    await expect(resolvePrefillId(fakeDelegate(rows), "26", canonical)).rejects.toEqual(
      new RedirectSentinel("/x/tambah/faktur/009-inv-iro-10-2026"),
    )
  })

  it("awalan slug yang unik → memantul ke slug utuh", async () => {
    await expect(resolvePrefillId(fakeDelegate(rows), "009", canonical)).rejects.toEqual(
      new RedirectSentinel("/x/tambah/faktur/009-inv-iro-10-2026"),
    )
  })

  it("awalan slug ambigu → 404", async () => {
    await expect(resolvePrefillId(fakeDelegate(rows), "0", canonical)).rejects.toThrow(NotFoundSentinel)
  })

  it("segmen tak dikenal → 404", async () => {
    await expect(resolvePrefillId(fakeDelegate(rows), "tidak-ada", canonical)).rejects.toThrow(
      NotFoundSentinel,
    )
  })
})

describe("redirectLegacyPrefillQuery", () => {
  const rows = [{ id: 26, slug: "009-inv-iro-10-2026" }]

  it("id valid → memantul ke path slug", async () => {
    await expect(
      redirectLegacyPrefillQuery(fakeDelegate(rows), "26", canonical, "/x/tambah"),
    ).rejects.toEqual(new RedirectSentinel("/x/tambah/faktur/009-inv-iro-10-2026"))
  })

  it("id tak ditemukan → form polos", async () => {
    await expect(
      redirectLegacyPrefillQuery(fakeDelegate(rows), "99", canonical, "/x/tambah"),
    ).rejects.toEqual(new RedirectSentinel("/x/tambah"))
  })

  it("nilai rusak → form polos tanpa query DB", async () => {
    const delegate = fakeDelegate(rows)
    await expect(
      redirectLegacyPrefillQuery(delegate, "abc", canonical, "/x/tambah"),
    ).rejects.toEqual(new RedirectSentinel("/x/tambah"))
    expect(delegate.findUnique).not.toHaveBeenCalled()
  })
})
