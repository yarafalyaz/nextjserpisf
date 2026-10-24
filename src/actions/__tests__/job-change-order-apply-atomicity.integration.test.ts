import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// ============================================================================
// Audit #515 gap MEDIUM-3: bukti atomicity DB NYATA (MySQL 8) untuk klaim
// terapkan JobChangeOrder — bukan mock.
//
// Klaim produksi (src/actions/job-change-order.actions.ts,
// applyJobChangeOrder langkah 1):
//   tx.jobChangeOrder.updateMany({
//     where: { id, status: "disetujui" },
//     data: { status: "diterapkan", appliedAt: new Date(), appliedBy },
//   })
//   // count === 0 -> kalah -> throw, seluruh tx rollback.
//
// File ini meniru klaim itu PERSIS (model, where, data) di dalam
// $transaction terhadap DB nyata, dijalankan konkuren: tepat SATU
// transaksi boleh menang (count 1); sisanya count 0 dan status akhir
// tetap satu kali "diterapkan". Mock Prisma tidak dapat membuktikan
// ini — updateMany kondisional hanya atomik karena engine DB.
//
// Kenapa tiruan, bukan memanggil Server Action produksi: action butuh
// sesi NextAuth (requirePermission), revalidatePath, dan aksi uang
// existing; repo tidak punya harness action-test DB nyata (pola yang
// sama dipakai bank-statement-concurrency.integration.test.ts).
// Penjaga mock job-change-order-guard.test.ts mengunci bentuk klaim
// produksi (where {id, status:"disetujui"} -> data status
// "diterapkan"); file ini membuktikan bentuk itu atomik di DB nyata.
//
// Env: INTEGRATION_DB_URL wajib eksplisit. Tanpa env, suite SKIP —
// dan langkah CI db-integration menolak log yang mengandung 'skipped'
// untuk file ini (anti-skip, pola bank statement).
// ============================================================================

const INTEGRATION_DB_URL = process.env.INTEGRATION_DB_URL

const describeIntegration = INTEGRATION_DB_URL ? describe : describe.skip

if (!INTEGRATION_DB_URL) {
  console.warn(
    "INTEGRATION_DB_URL tidak diset — suite atomicity JobChangeOrder SKIP (tidak dihitung lulus).",
  )
}

const prisma = INTEGRATION_DB_URL
  ? new PrismaClient({ adapter: new PrismaMariaDb(INTEGRATION_DB_URL) })
  : null

/** Tiruan persis klaim langkah (1) applyJobChangeOrder produksi. */
async function claimApply(
  client: PrismaClient,
  changeOrderId: number,
  appliedBy: number,
): Promise<number> {
  return client.$transaction(async (tx) => {
    const claim = await tx.jobChangeOrder.updateMany({
      where: { id: changeOrderId, status: "disetujui" },
      data: { status: "diterapkan", appliedAt: new Date(), appliedBy },
    })
    if (claim.count === 0) {
      const existing = await tx.jobChangeOrder.findUnique({
        where: { id: changeOrderId },
        select: { status: true },
      })
      if (!existing) throw new Error("Change order tidak ditemukan")
      throw new Error(
        `Change order hanya dapat diterapkan dari status disetujui. Status saat ini '${existing.status}'.`,
      )
    }
    return claim.count
  })
}

describeIntegration("JobChangeOrder apply — atomicity klaim DB nyata", () => {
  let customerId = 0
  let quotationId = 0
  let workOrderId = 0
  let changeOrderId = 0

  beforeAll(async () => {
    if (!prisma) return
    const stamp = Date.now()
    const customer = await prisma.customer.create({
      data: { name: `JCO Atomicity ${stamp}` },
    })
    customerId = customer.id
    const quotation = await prisma.quotation.create({
      data: {
        slug: `jco-atomicity-${stamp}`,
        documentNo: `JCO-IT-Q-${stamp}`,
        customerId,
        date: new Date(),
        subtotal: 60000,
        discount: 0,
        tax: 0,
        grandTotal: 60000,
        status: "approved",
      },
    })
    quotationId = quotation.id
    const workOrder = await prisma.workOrder.create({
      data: {
        documentNo: `JCO-IT-WO-${stamp}`,
        customerId,
        quotationId,
        date: new Date(),
        status: "in_progress",
      },
    })
    workOrderId = workOrder.id
    const co = await prisma.jobChangeOrder.create({
      data: {
        slug: `jco-atomicity-co-${stamp}`,
        documentNo: `JCO-IT-WO-${stamp}-CO-001`,
        sequence: 1,
        workOrderId,
        quotationId,
        status: "disetujui",
        reason: "Fixture atomicity audit #515",
      },
    })
    changeOrderId = co.id
  })

  afterAll(async () => {
    if (!prisma) return
    // Urutan hapus hormati FK: CO (cascade dari WO juga bisa, eksplisit aman).
    await prisma.jobChangeOrder.deleteMany({ where: { id: changeOrderId } })
    await prisma.workOrder.deleteMany({ where: { id: workOrderId } })
    await prisma.quotation.deleteMany({ where: { id: quotationId } })
    await prisma.customer.deleteMany({ where: { id: customerId } })
    await prisma.$disconnect()
  })

  it("8 klaim konkuren pada CO disetujui yang sama: tepat satu menang", async () => {
    if (!prisma) throw new Error("prisma integration tidak terinisialisasi")
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => claimApply(prisma, changeOrderId, 9000 + i)),
    )
    const winners = attempts.filter(
      (a): a is PromiseFulfilledResult<number> => a.status === "fulfilled" && a.value === 1,
    )
    const losers = attempts.filter((a) => a.status === "rejected")
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(7)
    for (const loser of losers) {
      expect(String((loser as PromiseRejectedResult).reason)).toMatch(
        /hanya dapat diterapkan dari status disetujui/,
      )
    }

    const final = await prisma.jobChangeOrder.findUnique({
      where: { id: changeOrderId },
      select: { status: true, appliedAt: true, appliedBy: true },
    })
    expect(final?.status).toBe("diterapkan")
    expect(final?.appliedAt).not.toBeNull()
    expect(final?.appliedBy).toBeGreaterThanOrEqual(9000)
    expect(final?.appliedBy).toBeLessThan(9008)
  })

  it("klaim kedua sesudah commit pemenang: count 0 (idempoten, tidak dobel-terapkan)", async () => {
    if (!prisma) throw new Error("prisma integration tidak terinisialisasi")
    await expect(claimApply(prisma, changeOrderId, 9999)).rejects.toThrow(
      /hanya dapat diterapkan dari status disetujui/,
    )
    const final = await prisma.jobChangeOrder.findUnique({
      where: { id: changeOrderId },
      select: { status: true },
    })
    expect(final?.status).toBe("diterapkan")
  })
})
