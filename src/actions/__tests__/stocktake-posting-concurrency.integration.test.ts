import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// ============================================================================
// Tes konkurensi DB NYATA untuk AUD-01 — posting stock opname (stocktake).
//
// Dua lapis bukti, pola yang sama dengan bank-statement-concurrency:
// 1. FILE INI: transaksi tiruan yang urutan lock-nya meniru produksi
//    membuktikan di DB sungguhan bahwa klaim `approved -> posted`
//    single-winner untuk kedua cabang (ada selisih & tanpa selisih).
// 2. GUARD MOCK di inventory.actions.test.ts ("postStocktakeSession ...")
//    memverifikasi action produksi memakai urutan ini: satu $transaction,
//    `SELECT id FROM stocktake_sessions ... FOR UPDATE`, baca ulang status,
//    lalu posted/adjustment hanya oleh pemegang lock.
//
// Jalur produksi yang ditiru (postStocktakeSession sesudah perbaikan AUD-01):
//   tx: lock sesi FOR UPDATE -> findUnique(+lines) -> status harus approved
//       -> finalizeCounts -> tanpa selisih: update posted (tanpa adjustment)
//       -> berselisih: buat StockAdjustment(draft) -> update posted+adjustmentId.
//
// Env: INTEGRATION_DB_URL wajib diset eksplisit; tanpa itu suite SKIP.
// ============================================================================

const INTEGRATION_DB_URL = process.env.INTEGRATION_DB_URL
const describeIntegration = INTEGRATION_DB_URL ? describe : describe.skip

function makeClient() {
  return new PrismaClient({ adapter: new PrismaMariaDb(INTEGRATION_DB_URL!) })
}

const STAMP = `${Date.now()}`

async function postLikeProduction(client: PrismaClient, sessionId: number, tag: string) {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stocktake_sessions WHERE id = ${sessionId} FOR UPDATE`
    const session = await tx.stocktakeSession.findUnique({
      where: { id: sessionId },
      include: { lines: true },
    })
    if (!session) throw new Error("Sesi opname tidak ditemukan")
    if (session.status !== "approved") {
      throw new Error("Hanya sesi yang disetujui yang bisa diposting")
    }
    const differing = session.lines.filter(
      (l) => Number(l.count1 ?? l.systemQty) !== Number(l.systemQty),
    )
    if (differing.length === 0) {
      await tx.stocktakeSession.update({ where: { id: sessionId }, data: { status: "posted" } })
      return { adjustmentId: null as number | null }
    }
    const adj = await tx.stockAdjustment.create({
      data: {
        documentNo: `ADJ-AUD01-${STAMP}-${tag}`,
        warehouseId: session.warehouseId,
        date: new Date(),
        status: "draft",
        notes: `Posting opname ${session.documentNo}`,
        items: {
          create: differing.map((l) => ({
            itemId: l.itemId,
            systemQty: l.systemQty,
            actualQty: l.count1 ?? l.systemQty,
            difference: 0,
            unitCost: 0,
            totalCost: 0,
          })),
        },
      },
    })
    await tx.stocktakeSession.update({
      where: { id: sessionId },
      data: { status: "posted", adjustmentId: adj.id },
    })
    return { adjustmentId: adj.id as number | null }
  })
}

describeIntegration("AUD-01 konkurensi DB nyata: posting opname single-winner", () => {
  // Klien dibuat lambat di beforeAll: callback describe tetap dievaluasi
  // saat koleksi walau suite di-skip (URL belum tentu ada).
  let clientA: PrismaClient
  let clientB: PrismaClient
  let warehouseId = 0
  let itemId = 0
  const sessionIds: number[] = []
  const adjustmentNos: string[] = []

  async function makeSession(count1: number) {
    const session = await clientA.stocktakeSession.create({
      data: {
        documentNo: `STK-AUD01-${STAMP}-${sessionIds.length}`,
        warehouseId,
        date: new Date(),
        status: "approved",
        lines: { create: [{ itemId, systemQty: 10, count1 }] },
      },
    })
    sessionIds.push(session.id)
    return session.id
  }

  beforeAll(async () => {
    clientA = makeClient()
    clientB = makeClient()
    const wh = await clientA.warehouse.create({
      data: { code: `AUD01-${STAMP}`, name: `AUD01 ${STAMP}` },
    })
    warehouseId = wh.id
    const item = await clientA.item.create({
      data: { sku: `AUD01-${STAMP}`, name: `AUD01 item ${STAMP}`, unitOfMeasure: "PCS" },
    })
    itemId = item.id
  })

  afterAll(async () => {
    await clientA.stockAdjustment.deleteMany({
      where: { documentNo: { startsWith: `ADJ-AUD01-${STAMP}` } },
    })
    await clientA.stocktakeSession.deleteMany({ where: { id: { in: sessionIds } } })
    await clientA.item.deleteMany({ where: { id: itemId } })
    await clientA.warehouse.deleteMany({ where: { id: warehouseId } })
    await clientA.$disconnect()
    await clientB.$disconnect()
  })

  it("cabang berselisih: dua posting paralel, tepat satu adjustment", async () => {
    const sessionId = await makeSession(8)
    const results = await Promise.allSettled([
      postLikeProduction(clientA, sessionId, "a"),
      postLikeProduction(clientB, sessionId, "b"),
    ])
    const winners = results.filter((r) => r.status === "fulfilled")
    const losers = results.filter((r) => r.status === "rejected")
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)

    const session = await clientA.stocktakeSession.findUnique({ where: { id: sessionId } })
    expect(session?.status).toBe("posted")
    expect(session?.adjustmentId).not.toBeNull()
    const adjustments = await clientA.stockAdjustment.findMany({
      where: { documentNo: { startsWith: `ADJ-AUD01-${STAMP}` } },
    })
    expect(adjustments).toHaveLength(1)
    adjustmentNos.push(...adjustments.map((a) => a.documentNo))
  })

  it("cabang tanpa selisih: dua posting paralel, tepat satu yang posted", async () => {
    const sessionId = await makeSession(10)
    const results = await Promise.allSettled([
      postLikeProduction(clientA, sessionId, "c"),
      postLikeProduction(clientB, sessionId, "d"),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1)
    const session = await clientA.stocktakeSession.findUnique({ where: { id: sessionId } })
    expect(session?.status).toBe("posted")
    expect(session?.adjustmentId).toBeNull()
  })
})
