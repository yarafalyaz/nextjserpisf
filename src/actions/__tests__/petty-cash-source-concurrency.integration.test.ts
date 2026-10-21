import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// ============================================================================
// Tes konkurensi DB NYATA untuk AUD-02 — saldo sumber kas kecil IN.
//
// Dua lapis bukti, pola yang sama dengan bank-statement-concurrency:
// 1. FILE INI: transaksi tiruan yang meniru urutan produksi membuktikan di
//    DB sungguhan bahwa dua IN paralel yang sendiri-sendiri lolos TIDAK
//    bisa sama-sama lolos bila totalnya melampaui saldo sumber.
// 2. GUARD MOCK di finance.actions.test.ts ("createPettyCash IN ...")
//    memverifikasi action produksi mengunci akun sumber di dalam transaksi
//    sebelum membaca saldo jurnal.
//
// Jalur produksi yang ditiru (createPettyCash tipe IN sesudah AUD-02):
//   tx: lock tabel petty_cash -> lock baris akun sumber (accounts FOR
//       UPDATE) -> saldo = Σ(debit-kredit) journalEntry POSTED akun sumber
//       -> tolak bila saldo < amount -> buat baris petty cash -> posting
//       jurnal (debit kas kecil / kredit sumber) di transaksi yang sama.
//
// Env: INTEGRATION_DB_URL wajib diset eksplisit; tanpa itu suite SKIP.
// ============================================================================

const INTEGRATION_DB_URL = process.env.INTEGRATION_DB_URL
const describeIntegration = INTEGRATION_DB_URL ? describe : describe.skip

function makeClient() {
  return new PrismaClient({ adapter: new PrismaMariaDb(INTEGRATION_DB_URL!) })
}

const STAMP = `${Date.now()}`

async function createInLikeProduction(
  client: PrismaClient,
  args: { sourceId: number; pettyAccountId: number; amount: number; documentNo: string },
) {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM petty_cash FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${args.sourceId} FOR UPDATE`
    const entries = await tx.journalEntry.findMany({
      where: { accountId: args.sourceId, journal: { status: "POSTED" } },
    })
    const sourceBalance = entries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0)
    if (sourceBalance < args.amount) {
      throw new Error(
        `Saldo akun Kas/Bank tidak mencukupi: tersedia ${sourceBalance}, dibutuhkan ${args.amount}`,
      )
    }
    const last = await tx.pettyCash.findFirst({ orderBy: [{ date: "desc" }, { id: "desc" }] })
    const balanceBefore = last ? Number(last.balanceAfter) : 0
    const created = await tx.pettyCash.create({
      data: {
        documentNo: args.documentNo,
        type: "IN",
        amount: args.amount,
        balanceBefore,
        balanceAfter: balanceBefore + args.amount,
        date: new Date(),
      },
    })
    const journal = await tx.journal.create({
      data: {
        journalNumber: `JR-AUD02-${args.documentNo}`,
        transactionDate: new Date(),
        status: "POSTED",
        totalDebit: args.amount,
        totalCredit: args.amount,
        entries: {
          create: [
            { accountId: args.pettyAccountId, debit: args.amount, credit: 0 },
            { accountId: args.sourceId, debit: 0, credit: args.amount },
          ],
        },
      },
    })
    return { pettyCashId: created.id, journalId: journal.id }
  })
}

describeIntegration("AUD-02 konkurensi DB nyata: saldo sumber kas kecil serial per akun", () => {
  // Klien dibuat lambat di beforeAll: callback describe tetap dievaluasi
  // saat koleksi walau suite di-skip (URL belum tentu ada).
  let clientA: PrismaClient
  let clientB: PrismaClient
  let sourceId = 0
  let pettyAccountId = 0
  let seedJournalId = 0

  beforeAll(async () => {
    clientA = makeClient()
    clientB = makeClient()
    const source = await clientA.account.create({
      data: { code: `AUD02-SRC-${STAMP}`, name: `AUD02 sumber ${STAMP}`, type: "ASSET" },
    })
    sourceId = source.id
    const petty = await clientA.account.create({
      data: { code: `AUD02-PC-${STAMP}`, name: `AUD02 kas kecil ${STAMP}`, type: "ASSET" },
    })
    pettyAccountId = petty.id
    // Saldo sumber awal 1000 (debit sumber / kredit kas kecil).
    const seed = await clientA.journal.create({
      data: {
        journalNumber: `JR-AUD02-SEED-${STAMP}`,
        transactionDate: new Date(),
        status: "POSTED",
        totalDebit: 1000,
        totalCredit: 1000,
        entries: {
          create: [
            { accountId: sourceId, debit: 1000, credit: 0 },
            { accountId: pettyAccountId, debit: 0, credit: 1000 },
          ],
        },
      },
    })
    seedJournalId = seed.id
  })

  afterAll(async () => {
    await clientA.pettyCash.deleteMany({
      where: { documentNo: { startsWith: `PC-AUD02-${STAMP}` } },
    })
    await clientA.journal.deleteMany({
      where: { journalNumber: { startsWith: `JR-AUD02-` } },
    })
    await clientA.account.deleteMany({ where: { id: { in: [sourceId, pettyAccountId] } } })
    await clientA.$disconnect()
    await clientB.$disconnect()
  })

  it("dua IN 600 paralel dari saldo 1000: tepat satu lolos", async () => {
    const results = await Promise.allSettled([
      createInLikeProduction(clientA, {
        sourceId,
        pettyAccountId,
        amount: 600,
        documentNo: `PC-AUD02-${STAMP}-a`,
      }),
      createInLikeProduction(clientB, {
        sourceId,
        pettyAccountId,
        amount: 600,
        documentNo: `PC-AUD02-${STAMP}-b`,
      }),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1)

    const rows = await clientA.pettyCash.findMany({
      where: { documentNo: { startsWith: `PC-AUD02-${STAMP}` } },
    })
    expect(rows).toHaveLength(1)
    // Saldo sumber akhir: 1000 - 600 = 400 (hanya jurnal pemenang terposting).
    const entries = await clientA.journalEntry.findMany({
      where: { accountId: sourceId, journal: { status: "POSTED" } },
    })
    const balance = entries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0)
    expect(balance).toBe(400)
    expect(seedJournalId).toBeGreaterThan(0)
  })
})
