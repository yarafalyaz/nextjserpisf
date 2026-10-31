import { describe, it, expect, vi } from "vitest"

/**
 * R8-PAJAK-09: `nextSlugWithClient` memeriksa tabrakan lewat delegate
 * client yang diberikan (tx pemanggil), bukan prisma global — baris
 * tak-tercommit milik transaksi lain ikut terlihat oleh tx-nya sendiri
 * dan slug yang sudah dipakai di dalam tx yang sama tidak dipilih ulang.
 */
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))

import { nextSlugWithClient } from "@/lib/utils/slug-db"

describe("nextSlugWithClient (R8-PAJAK-09)", () => {
  it("memakai delegate client yang diberikan dan menghindari tabrakan di dalamnya", async () => {
    const seen: string[] = []
    const client = {
      taxPayment: {
        findFirst: vi.fn(async ({ where }: { where: { slug: string } }) => {
          seen.push(where.slug)
          return where.slug === "pajk-0001" ? { id: 1 } : null
        }),
      },
    }
    const slug = await nextSlugWithClient(client as never, "taxPayment", "PAJK-0001")
    expect(seen.length).toBeGreaterThan(1)
    expect(slug).not.toBe("pajk-0001")
    expect(slug?.startsWith("pajk-0001")).toBe(true)
  })

  it("menghormati excludeId pada cek tabrakan", async () => {
    const calls: unknown[] = []
    const client = {
      journal: {
        findFirst: vi.fn(async (args: unknown) => {
          calls.push(args)
          return null
        }),
      },
    }
    await nextSlugWithClient(client as never, "journal", "JRN-0001", { excludeId: 9 })
    expect(calls[0]).toMatchObject({ where: { slug: "jrn-0001", id: { not: 9 } } })
  })
})
