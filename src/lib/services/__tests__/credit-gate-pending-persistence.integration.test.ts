import { afterAll, beforeAll, expect, it } from "vitest"
import {
  createTestClient,
  describeIntegration,
  warnIntegrationSkip,
} from "@/actions/__tests__/integration-concurrency-fixtures"
import type { PrismaClient } from "@prisma/client"

/**
 * F-2026-10-25-035-B fix TEMUAN Business 6422009586 (kartu t_0f202cef):
 * rekod pending CreditOverride HARUS persisten sesudah simpan tertahan.
 *
 * Bukti DB nyata (bukan mock tx): pola transaksi di bawah meniru persis
 * urutan produksi baru —
 *   tx lahir: assessCreditGateInTx -> assertCreditGatePassed throw
 *             -> rollback (dokumen tiruan ikut lenyap)
 *   fase 3:   persistCreditGatePending di tx pendek tersendiri
 *             -> tepat 1 pending persisten
 *   approve oleh user lain (update langsung meniru approveCreditOverride;
 *   SoD-nya sendiri dibuktikan tes action termock) -> simpan ulang:
 *   assess -> override_ready -> create dokumen -> consume dalam tx sama
 *   -> used + usedDocumentId/No terisi; pakai kedua -> tertahan lagi.
 *
 * Service diimpor dinamis sesudah env test client siap; service memakai
 * prisma global untuk fase 3, jadi DATABASE_URL proses diarahkan ke DB
 * tes yang sama oleh perintah run (lihat header fixtures). Tanpa
 * INTEGRATION_DB_URL suite SKIP (bukan lulus).
 *
 * Run lokal:
 *   INTEGRATION_DB_URL='mysql://...@127.0.0.1:3309/silengkap_credit_gate_test?allowPublicKeyRetrieval=true' \
 *   DATABASE_URL="$INTEGRATION_DB_URL" TZ=Asia/Jakarta \
 *     npx vitest run src/lib/services/__tests__/credit-gate-pending-persistence.integration.test.ts
 */

warnIntegrationSkip("credit-gate-pending-persistence")

const STAMP = `${Date.now()}`
const CODE = `CGP-${STAMP}`

describeIntegration("CreditOverride pending persisten sesudah rollback tx lahir (035-B)", () => {
  let client: PrismaClient
  let service: typeof import("../credit-gate.service")
  let customerId = 0
  let settingId = 0
  const requestedBy = 7001
  const approverId = 7002

  const attempt = () => ({
    customerId,
    documentType: "sales_order" as const,
    attemptedAmount: 600_000,
    requestedBy,
    requestReason: "Proyek mendesak pelanggan",
  })

  beforeAll(async () => {
    client = createTestClient()
    service = await import("../credit-gate.service")
    const setting = await client.systemSetting.findFirst({ select: { id: true } })
    if (setting) {
      settingId = setting.id
      await client.systemSetting.update({
        where: { id: setting.id },
        data: { creditGateEnabled: true },
      })
    } else {
      const created = await client.systemSetting.create({
        data: { creditGateEnabled: true },
      })
      settingId = created.id
    }
    const customer = await client.customer.create({
      data: { name: `CGP ${STAMP}`, code: CODE, creditLimit: 500_000 },
    })
    customerId = customer.id
  })

  afterAll(async () => {
    await client.creditOverride.deleteMany({ where: { customerId } })
    await client.salesOrder.deleteMany({ where: { customerId } })
    await client.customer.deleteMany({ where: { id: customerId } })
    if (settingId) {
      await client.systemSetting.update({
        where: { id: settingId },
        data: { creditGateEnabled: false },
      }).catch(() => undefined)
    }
    await client.$disconnect()
  })

  it("tertahan: 0 dokumen lahir, tepat 1 pending persisten; approve user lain; simpan ulang identik -> used; pakai kedua tertahan", async () => {
    // --- Percobaan 1: tx lahir rollback penuh.
    await expect(
      client.$transaction(async (tx) => {
        const outcome = await service.assessCreditGateInTx(tx as never, attempt())
        // Dokumen tiruan dibuat SEBELUM assert untuk membuktikan rollback
        // menghapus dokumen tetapi (fase 3) bukan rekod pending.
        await tx.salesOrder.create({
          data: {
            documentNo: `SO-CGP-${STAMP}-ghost`,
            customerId,
            date: new Date(),
            grandTotal: 600_000,
            totalAmount: 600_000,
            status: "draft",
          },
        })
        service.assertCreditGatePassed(outcome)
      }),
    ).rejects.toBeInstanceOf(service.CreditGateBlockedError)

    expect(
      await client.salesOrder.count({ where: { customerId } }),
    ).toBe(0)
    // Tanpa fase 3, pending ikut rollback: 0 baris (kondisi cacat lama).
    expect(
      await client.creditOverride.count({ where: { customerId } }),
    ).toBe(0)

    // --- Fase 3: persist di tx tersendiri, dua kali -> tetap tepat 1.
    const blockedOutcome = await client.$transaction(async (tx) => {
      const outcome = await service.assessCreditGateInTx(tx as never, attempt())
      if (outcome.kind !== "blocked") throw new Error("harus blocked")
      return outcome
    })
    const pendingId = await service.persistCreditGatePending(blockedOutcome)
    expect(pendingId).not.toBeNull()
    const againId = await service.persistCreditGatePending(blockedOutcome)
    expect(againId).toBe(pendingId)
    const pendingRows = await client.creditOverride.findMany({
      where: { customerId },
    })
    expect(pendingRows).toHaveLength(1)
    expect(pendingRows[0]).toMatchObject({
      id: pendingId,
      status: "pending",
      requestedBy,
      documentType: "sales_order",
    })
    expect(Number(pendingRows[0].attemptedAmount)).toBe(600_000)

    // --- Approve oleh user lain (SoD dibuktikan tes action; di sini
    // transisi statusnya yang dipakai fase 2).
    await client.creditOverride.update({
      where: { id: pendingId as number },
      data: {
        status: "approved",
        decidedBy: approverId,
        decidedAt: new Date(),
        expiresAt: service.creditOverrideExpiryWib(new Date()),
      },
    })

    // --- Simpan ulang identik: dokumen lahir + used dalam tx yang sama.
    const so = await client.$transaction(async (tx) => {
      const outcome = await service.assessCreditGateInTx(tx as never, attempt())
      const overrideId = service.assertCreditGatePassed(outcome)
      expect(overrideId).toBe(pendingId)
      const created = await tx.salesOrder.create({
        data: {
          documentNo: `SO-CGP-${STAMP}-real`,
          customerId,
          date: new Date(),
          grandTotal: 600_000,
          totalAmount: 600_000,
          status: "draft",
        },
      })
      await service.consumeApprovedCreditOverrideInTx(
        tx as never,
        overrideId as number,
        attempt(),
        { id: created.id, documentNo: created.documentNo },
      )
      return created
    })
    const used = await client.creditOverride.findUnique({
      where: { id: pendingId as number },
    })
    expect(used).toMatchObject({
      status: "used",
      usedDocumentId: so.id,
      usedDocumentNo: so.documentNo,
      decidedBy: approverId,
    })

    // --- Pakai kedua untuk dokumen lain: tertahan lagi, persist
    // mengembalikan id rekod used yang sama? Tidak — sidik sama tetapi
    // status used bukan live, jadi pending BARU lahir.
    const secondBlocked = await client.$transaction(async (tx) => {
      const outcome = await service.assessCreditGateInTx(tx as never, attempt())
      if (outcome.kind !== "blocked") throw new Error("harus blocked lagi")
      return outcome
    })
    const secondPendingId = await service.persistCreditGatePending(secondBlocked)
    expect(secondPendingId).not.toBeNull()
    expect(secondPendingId).not.toBe(pendingId)
    expect(
      await client.creditOverride.count({ where: { customerId, status: "pending" } }),
    ).toBe(1)
  })

  it("tanpa alasan (jalur convert/DP/resync): tertahan tanpa rekod pending", async () => {
    const customer2 = await client.customer.create({
      data: { name: `CGP-NR ${STAMP}`, code: `${CODE}-NR`, creditLimit: 100_000 },
    })
    try {
      const outcome = await client.$transaction(async (tx) =>
        service.assessCreditGateInTx(tx as never, {
          customerId: customer2.id,
          documentType: "sales_invoice",
          attemptedAmount: 200_000,
          requestedBy,
          requestReason: null,
        }),
      )
      expect(outcome.kind).toBe("blocked")
      if (outcome.kind === "blocked") {
        expect(await service.persistCreditGatePending(outcome)).toBeNull()
      }
      expect(
        await client.creditOverride.count({ where: { customerId: customer2.id } }),
      ).toBe(0)
    } finally {
      await client.creditOverride.deleteMany({ where: { customerId: customer2.id } })
      await client.customer.deleteMany({ where: { id: customer2.id } })
    }
  })
})
