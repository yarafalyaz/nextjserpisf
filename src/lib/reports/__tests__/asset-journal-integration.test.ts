/**
 * Tes integrasi DB untuk laporan Jurnal Aset Tetap.
 *
 * Alasan tes ini ada: penyaring penyusutan memakai **awalan**
 * `referenceType = "ASSET_DEPRECIATION_"` karena referenceType-nya memuat periode
 * (jurnal unik pada referenceType+referenceId). Kalau suatu saat penyaringnya
 * diganti kesamaan, tes unit tetap hijau — fixture-nya dibuat di memori, bukan
 * lewat Prisma. Hanya tes yang benar-benar menyentuh database yang bisa menangkap
 * regresi itu. Opt-in seperti suite integrasi lain:
 *
 *   RUN_DB_INTEGRATION=1 npx vitest run src/lib/reports/__tests__/asset-journal-integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { loadAssetJournal } from "@/lib/reports/asset-reports-data"
import { prisma } from "@/lib/db/prisma"

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

const stamp = Date.now()
const assetCode = `AST-IT${stamp}`
const journalNumbers = [`JU-IT${stamp}-DEP`, `JU-IT${stamp}-DRAFT`, `JU-IT${stamp}-LAIN`]
const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

afterAll(async () => {
  if (process.env.RUN_DB_INTEGRATION !== "1") return
  const assets = await prisma.asset.findMany({ where: { code: assetCode }, select: { id: true } })
  await prisma.journal.deleteMany({ where: { journalNumber: { in: journalNumbers } } })
  await prisma.assetHistory.deleteMany({ where: { assetId: { in: assets.map((a) => a.id) } } })
  await prisma.asset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } })
  await prisma.$disconnect()
})

describe("Jurnal Aset Tetap (DB integration)", () => {
  it("menyaring jurnal aset lewat awalan referenceType dan hanya status POSTED", async () => {
    if (process.env.RUN_DB_INTEGRATION !== "1") {
      console.warn("RUN_DB_INTEGRATION not enabled — skipping DB integration test")
      return
    }
    if (!dbUp) {
      console.warn("DB not reachable — skipping integration test")
      return
    }

    const accounts = await prisma.account.findMany({ take: 2, select: { id: true } })
    expect(accounts).toHaveLength(2)

    const asset = await prisma.asset.create({
      data: { code: assetCode, name: `Aset Integrasi ${stamp}`, purchaseCost: 5_000_000, status: "active" },
    })

    const entryLines = {
      create: [
        { accountId: accounts[0].id, debit: 100_000, credit: 0 },
        { accountId: accounts[1].id, debit: 0, credit: 100_000 },
      ],
    }

    await prisma.journal.create({
      data: {
        journalNumber: journalNumbers[0],
        transactionDate: new Date("2026-10-20T00:00:00"),
        referenceType: "ASSET_DEPRECIATION_202610",
        referenceId: asset.id,
        type: "DEPRECIATION",
        status: "POSTED",
        totalDebit: 100_000,
        totalCredit: 100_000,
        entries: entryLines,
      },
    })

    // Draf aset: belum mengubah buku besar, jadi tidak boleh masuk laporan.
    // Periode di referenceType-nya BEDA karena jurnal unik pada
    // (referenceType, referenceId) — dua jurnal dengan pasangan sama ditolak DB.
    await prisma.journal.create({
      data: {
        journalNumber: journalNumbers[1],
        transactionDate: new Date("2026-10-21T00:00:00"),
        referenceType: "ASSET_DEPRECIATION_202611",
        referenceId: asset.id,
        type: "DEPRECIATION",
        status: "DRAFT",
        totalDebit: 100_000,
        totalCredit: 100_000,
        entries: entryLines,
      },
    })

    // Jurnal bukan-aset pada periode yang sama: harus tersaring keluar.
    await prisma.journal.create({
      data: {
        journalNumber: journalNumbers[2],
        transactionDate: new Date("2026-10-22T00:00:00"),
        referenceType: "SALES_INVOICE",
        referenceId: asset.id,
        type: "SALES",
        status: "POSTED",
        totalDebit: 100_000,
        totalCredit: 100_000,
        entries: entryLines,
      },
    })

    const report = await loadAssetJournal(period)
    const teks = report.journal.table.rows
      .map((row) =>
        row.kind === "group"
          ? row.label
          : row.kind === "notice"
            ? row.text
            : row.cells.join(" "),
      )
      .join(" | ")

    expect(teks).toContain(journalNumbers[0])
    expect(teks).toContain("Penyusutan")
    expect(teks).toContain(assetCode)
    expect(teks).not.toContain(journalNumbers[1])
    expect(teks).not.toContain(journalNumbers[2])
    expect(report.journal.isBalanced).toBe(true)
  })
})
