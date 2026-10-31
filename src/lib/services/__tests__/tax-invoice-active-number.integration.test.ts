import "dotenv/config"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"

/**
 * R8-PAJAK-01 (DB integration, opt-in RUN_DB_INTEGRATION=1):
 * kunci unik `active_number_key` hanya mengikat faktur yang masih hidup.
 * Pengganti memakai nomor seri yang sama dengan faktur diganti, jadi dua
 * baris bernomor sama sah asal hanya satu yang tidak `replaced`; baris
 * aktif kedua dengan nomor yang sama tetap ditolak DB (P2002).
 */
let dbUp = false
beforeAll(async () => {
  if (process.env.RUN_DB_INTEGRATION !== "1") return
  try {
    await prisma.$queryRaw`SELECT 1`
    dbUp = true
  } catch {
    dbUp = false
  }
})
afterAll(async () => {
  try {
    await prisma.$disconnect()
  } catch {
    /* abaikan */
  }
})

describe("R8-PAJAK-01 kunci nomor aktif", () => {
  it("pengganti bernomor sama lahir sesudah asal replaced; aktif kedua ditolak", async (ctx) => {
    if (!dbUp) ctx.skip()
    const stamp = Date.now().toString().slice(-8)
    const number = `011.001-26.${stamp}`
    const created: number[] = []
    try {
      const origin = await prisma.taxInvoice.create({
        data: {
          direction: "out",
          transactionCode: "04",
          taxInvoiceNumber: number,
          taxInvoiceDate: new Date(),
          taxPeriod: "2026-10",
          dpp: 100,
          taxAmount: 12,
          djpStatus: "approved",
        },
      })
      created.push(origin.id)
      // Pengganti: asal berstatus replaced dulu, lalu baris baru nomor sama.
      await prisma.taxInvoice.update({ where: { id: origin.id }, data: { djpStatus: "replaced" } })
      const replacement = await prisma.taxInvoice.create({
        data: {
          direction: "out",
          transactionCode: "04",
          taxInvoiceNumber: number,
          taxInvoiceDate: new Date(),
          taxPeriod: "2026-10",
          dpp: 90,
          taxAmount: 11,
          djpStatus: "draft",
          replacesId: origin.id,
        },
      })
      created.push(replacement.id)
      expect(replacement.taxInvoiceNumber).toBe(number)
      // Baris aktif lain dengan nomor yang sama tetap ditolak unique aktif.
      await expect(
        prisma.taxInvoice.create({
          data: {
            direction: "out",
            transactionCode: "04",
            taxInvoiceNumber: number,
            taxInvoiceDate: new Date(),
            taxPeriod: "2026-10",
            dpp: 1,
            taxAmount: 1,
            djpStatus: "approved",
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" })
    } finally {
      if (created.length > 0) {
        await prisma.taxInvoice.deleteMany({ where: { id: { in: created } } })
      }
    }
  })
})
