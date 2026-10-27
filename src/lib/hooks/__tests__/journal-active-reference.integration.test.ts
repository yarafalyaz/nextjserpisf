import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// ============================================================================
// E127-8 / E127-8b — bukti FISIK MySQL 8 untuk F-2026-10-23-127-V Putusan 4
// (PR #664, migrasi 20261023170000_journal_active_reference_unique_f127v).
//
// Vonis BOT 4: unik jurnal hanya mengikat jurnal AKTIF
// (status <> 'REVERSED' AND deleted_at IS NULL, reference non-NULL) lewat
// kolom generated `active_reference_key` + `journals_active_reference_unique`.
// Fisik DB membuka re-post sesudah reversal untuk SEMUA referenceType;
// gerbang status dokumen (faktur cancelled tetap ditolak) adalah lapis
// aplikasi dan dibuktikan di tes unit sales.actions / quotation-sync /
// accounting-hook — file ini membuktikan separuh fisiknya di MySQL nyata:
//
//   E127-8 fisik : jurnal POSTED -> REVERSED -> jurnal aktif baru
//                  se-reference DIBUAT tanpa P2002 (re-post sah).
//   Pendamping   : dua jurnal AKTIF se-reference tetap P2002 (anti-dobel
//                  tidak dilonggarkan), DRAFT ikut mengikat, baris REVERSED
//                  dan soft-deleted boleh menumpuk, reference NULL bebas.
//
// Env: INTEGRATION_DB_URL wajib diset eksplisit ke DB tes yang SUDAH
// termigrasi (migrate deploy). Tanpa env itu suite SKIP — skip bukan lulus;
// langkah CI file ini anti-skip (grep 'skipped' = gagal), pola
// bank-statement-concurrency.integration.test.ts.
// ============================================================================

const INTEGRATION_DB_URL = process.env.INTEGRATION_DB_URL

const describeIntegration = INTEGRATION_DB_URL ? describe : describe.skip

if (!INTEGRATION_DB_URL) {
  console.warn(
    "[journal-active-reference] SKIP: INTEGRATION_DB_URL tidak diset — " +
      "tes fisik MySQL 8 tidak dijalankan (bukan lulus). " +
      "Set INTEGRATION_DB_URL ke DB tes termigrasi untuk menjalankannya.",
  )
}

function createTestClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaMariaDb(INTEGRATION_DB_URL as string),
  })
}

const isUniqueViolation = (e: unknown): boolean => {
  const code = (e as { code?: unknown } | null)?.code
  if (code === "P2002") return true
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes("1062") || msg.includes("journals_active_reference_unique")
}

describeIntegration("E127 fisik MySQL 8: unik jurnal aktif-saja (F-127-V)", () => {
  let db: PrismaClient
  // referenceId unik per run supaya tidak bertabrakan dengan data DB tes.
  const stamp = Number(String(Date.now()).slice(-9))
  const createdIds: number[] = []

  async function createJournal(referenceId: number, status: string, suffix: string) {
    const j = await db.journal.create({
      data: {
        journalNumber: `E127-${stamp}-${suffix}`,
        transactionDate: new Date("2099-01-15T00:00:00.000Z"),
        referenceType: "SalesInvoice",
        referenceId,
        description: "E127 integration fixture",
        type: "GENERAL",
        status,
        totalDebit: 100,
        totalCredit: 100,
      },
      select: { id: true },
    })
    createdIds.push(j.id)
    return j.id
  }

  beforeAll(async () => {
    db = createTestClient()
    await db.$queryRaw`SELECT 1`
  })

  afterAll(async () => {
    try {
      if (createdIds.length > 0) {
        await db.journal.deleteMany({ where: { id: { in: createdIds } } })
      }
    } finally {
      await db.$disconnect()
    }
  })

  it("E127-8 fisik: POSTED -> REVERSED -> jurnal aktif baru se-reference berhasil (re-post)", async () => {
    const ref = stamp + 1
    const firstId = await createJournal(ref, "POSTED", "a1")

    // Reversal pola repo: status asli menjadi REVERSED, reference utuh.
    await db.journal.update({ where: { id: firstId }, data: { status: "REVERSED" } })

    // Di bawah unik lama (journals_reference_unique) create ini P2002.
    const secondId = await createJournal(ref, "POSTED", "a2")
    expect(secondId).not.toBe(firstId)

    const rows = await db.journal.findMany({
      where: { referenceType: "SalesInvoice", referenceId: ref },
      select: { status: true },
      orderBy: { id: "asc" },
    })
    expect(rows.map((r) => r.status)).toEqual(["REVERSED", "POSTED"])
  })

  it("anti-dobel tetap: jurnal AKTIF kedua se-reference ditolak unik DB (P2002)", async () => {
    const ref = stamp + 2
    await createJournal(ref, "POSTED", "b1")
    await expect(createJournal(ref, "POSTED", "b2")).rejects.toSatisfy(isUniqueViolation)
  })

  it("DRAFT ikut mengikat: POSTED sesudah DRAFT aktif se-reference ditolak (P2002)", async () => {
    const ref = stamp + 3
    await createJournal(ref, "DRAFT", "c1")
    await expect(createJournal(ref, "POSTED", "c2")).rejects.toSatisfy(isUniqueViolation)
  })

  it("histori bebas menumpuk: REVERSED + soft-deleted se-reference tidak P2002", async () => {
    const ref = stamp + 4
    const reversed1 = await createJournal(ref, "REVERSED", "d1")
    const reversed2 = await createJournal(ref, "REVERSED", "d2")
    const deletedId = await createJournal(ref, "POSTED", "d3")
    await db.journal.update({ where: { id: deletedId }, data: { deletedAt: new Date() } })
    // Soft-deleted berhenti mengikat: aktif baru sah.
    const activeId = await createJournal(ref, "POSTED", "d4")
    expect([reversed1, reversed2, deletedId, activeId].every((id) => Number.isSafeInteger(id) && id > 0)).toBe(true)
    expect(new Set([reversed1, reversed2, deletedId, activeId]).size).toBe(4)

    const rows = await db.journal.findMany({
      where: { referenceType: "SalesInvoice", referenceId: ref },
      select: { status: true, deletedAt: true },
      orderBy: { id: "asc" },
    })
    // Hanya d4 yang aktif (POSTED + belum terhapus); sisanya histori bebas.
    expect(rows.map((r) => r.status)).toEqual(["REVERSED", "REVERSED", "POSTED", "POSTED"])
    expect(rows.filter((r) => r.status !== "REVERSED" && r.deletedAt === null)).toHaveLength(1)
    expect(rows[3].deletedAt).toBeNull()
  })

  it("jurnal umum tanpa reference tetap bisa ganda (reference NULL tidak mengikat)", async () => {
    const ids: number[] = []
    for (const suffix of ["e1", "e2"]) {
      const j = await db.journal.create({
        data: {
          journalNumber: `E127-${stamp}-${suffix}`,
          transactionDate: new Date("2099-01-15T00:00:00.000Z"),
          referenceType: null,
          referenceId: null,
          description: "E127 integration fixture (tanpa reference)",
          type: "GENERAL",
          status: "POSTED",
          totalDebit: 100,
          totalCredit: 100,
        },
        select: { id: true },
      })
      createdIds.push(j.id)
      ids.push(j.id)
    }
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])

    const rows = await db.journal.findMany({
      where: { id: { in: ids } },
      select: { referenceType: true, referenceId: true, status: true },
      orderBy: { id: "asc" },
    })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.referenceType === null && r.referenceId === null && r.status === "POSTED")).toBe(true)
  })
})
