import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { isOwnerManagedJournalReference } from "../journal-reversal-policy"

/**
 * Guard putaran 117 — jurnal alur produksi tidak boleh dibalik lewat jurnal
 * umum.
 *
 * Cacat yang dijaga: `reverseJournal` (izin `post_journals`, tanpa gerbang
 * dokumen) dulu hanya memblokir jurnal penutup tahun dan siklus aset.
 * Membalik jurnal `ProductionCost` membuat `onProductionCostAbsorbed`
 * kehilangan pembacaan nilai kumulatifnya (jurnal aktif di kunci itu menjadi
 * `REVERSED`), sehingga delta berikutnya menjadi satu-satunya jurnal aktif:
 * GL berhenti mencerminkan `totalActualCost` secara permanen dan tanpa gejala
 * di layar. Jenis lain (penyelesaian, pengeluaran bahan, scrap) hilang dari
 * laporan POSTED-saja tanpa lawannya.
 */
const ROOT = process.cwd()

describe("kebijakan reversal jurnal produksi", () => {
  it("menolak seluruh jenis jurnal alur produksi", () => {
    for (const referenceType of [
      "ProductionCost",
      "ProductionOrder",
      "ProductionOrder_321",
      "ProductionOrderCostVariance",
      "ProductionOrderCostVariance_321",
      "ProductionOrderMaterialIssue",
      "ProductionOrderAbnormalScrap",
      "MaterialIssue",
    ]) {
      expect(isOwnerManagedJournalReference(referenceType)).toBe(true)
    }
  })

  it("tidak menyentuh jurnal milik alur lain", () => {
    for (const referenceType of [
      "SalesInvoice",
      "SalesPayment",
      "PettyCash",
      "BANK_TRANSFER",
      "Payroll",
      "Journal",
      "",
      null,
      undefined,
    ]) {
      expect(isOwnerManagedJournalReference(referenceType)).toBe(false)
    }
  })

  it("reverseJournal memakai kebijakan ini (bukan daftar tangan)", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/actions/finance.actions.ts"),
      "utf8",
    )
    const start = source.indexOf("export async function reverseJournal")
    expect(start).toBeGreaterThan(-1)
    // Badan aksi sampai awal aksi berikutnya — cukup untuk memastikan
    // kebijakan dipanggil di dalamnya, bukan di tempat lain.
    const nextAction = source.indexOf("\nexport async function", start + 10)
    const body = source.slice(start, nextAction === -1 ? undefined : nextAction)
    expect(body).toContain("isOwnerManagedJournalReference(")
  })
})
