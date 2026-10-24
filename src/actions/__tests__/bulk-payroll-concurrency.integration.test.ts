import { Prisma, PrismaClient } from "@prisma/client"
import { afterAll, beforeAll, expect, it } from "vitest"
import {
  createTestClient,
  describeIntegration,
  warnIntegrationSkip,
} from "./integration-concurrency-fixtures"

import { findPayrollRangeConflict } from "@/lib/reports/payroll-frequency"

// ============================================================================
// Tes konkurensi MySQL 8 NYATA untuk penjaga irisan generateBulkPayroll
// (gap LOW audit pasca-merge BOT 6 t_31eab0e0 atas PR #672; tindak lanjut
// t_44b6862a). Penjaga produksi sebelumnya hanya terbukti di lapis kontrak
// mock (hrm.actions.test.ts "generateBulkPayroll penjaga irisan
// bertransaksi": urutan lock FOR UPDATE -> cek ulang -> createMany).
// Mock Prisma tidak bisa memberlakukan SELECT ... FOR UPDATE, jadi bukti
// perilaku DB hanya bisa dari file ini.
//
// DUA LAPIS BUKTI, jangan tertukar:
// 1. FILE INI (DB nyata): transaksi di bawah adalah TIRUAN yang pola
//    urutannya ditiru persis dari blok transaksi produksi
//    generateBulkPayroll (src/actions/hrm.actions.ts, blok
//    `prisma.$transaction(async (tx) => {...})` sesudah pembangunan rows):
//      lock karyawan populasi target (SELECT id FROM employees WHERE id IN
//        (...) ORDER BY id FOR UPDATE)
//      -> baca ulang slip aktif jendela (status notIn cancelled/canceled,
//        startDate <= rangeEnd, endDate >= rangeStart - 90 hari)
//      -> findPayrollRangeConflict (builder produksi ASLI, diimpor di atas)
//        per baris: konflik -> skip alasan "irisan" + conflictDocumentNo,
//        lolos -> keptRows
//      -> tx.payroll.createMany({ data: keptRows, skipDuplicates: true })
//    File ini membuktikan pola itu di MySQL 8 sungguhan: dua transaksi
//    konkuren rentang BERIRISAN TAK IDENTIK pada karyawan sama menghasilkan
//    tepat satu slip untuk karyawan tumpang-tindih, run kalah mencatat skip
//    irisan (bukan error, bukan slip dobel), karyawan non-irisan tetap
//    terbit. Kunci DB unik (employeeId, startDate, endDate) TIDAK bisa
//    membuktikan ini sendirian: rentang kedua run sengaja tak identik.
// 2. GUARD MOCK di hrm.actions.test.ts memverifikasi action produksi yang
//    sebenarnya memakai urutan lock -> cek ulang -> createMany di atas.
//    Kombinasi keduanya = bukti: guard mengikat tiruan ini ke kode
//    produksi, file ini membuktikan pola yang dikunci guard itu benar di
//    DB nyata.
//
// File ini SENGAJA tidak memanggil Server Action produksi langsung:
// generateBulkPayroll butuh sesi NextAuth (requirePermission
// "create_payroll"), estimasi gaji massal, penomoran dokumen, dan
// revalidatePath, dan repo tidak punya harness action-test DB nyata —
// semua tes action eksisting memakai Prisma termock, tes integration
// eksisting memakai transaksi tiruan persis pola ini (lihat
// bank-statement-concurrency.integration.test.ts). Yang ditiru di sini
// hanya blok transaksi penerbitan slipnya; pembangunan rows (estimasi,
// plafon potongan, gerbang frekuensi/berhenti) terjadi sebelum transaksi
// di produksi dan tidak menyentuh isu konkurensi irisan.
//
// Batas tiruan: `testHoldMs` menahan transaksi sesudah lock (tidur di
// dalam transaksi) HANYA untuk membuktikan transaksi kedua benar-benar
// terblokir menunggu lock, bukan kebetulan menang race. Produksi tidak
// punya tidur ini; tanpa lock, tes serialisasi itu merah.
//
// Env: INTEGRATION_DB_URL wajib diset eksplisit, mis.
//   INTEGRATION_DB_URL='mysql://root@127.0.0.1:3309/silengkap_test_concurrency?allowPublicKeyRetrieval=true' \
//     npx vitest run src/actions/__tests__/bulk-payroll-concurrency.integration.test.ts
// Tanpa env itu seluruh suite SKIP (CI unit biasa tidak boleh gagal, dan
// skip TIDAK dihitung lulus; job db-integration CI menolak log 'skipped').
// Engine target: MySQL 8. `allowPublicKeyRetrieval=true` wajib untuk auth
// caching_sha2_password MySQL 8 lewat adapter-mariadb di koneksi pertama.
// ============================================================================

warnIntegrationSkip("bulk-payroll-concurrency")

const STAMP = `${Date.now()}`
const DOC_PREFIX = `PAY-BPC-${STAMP}`
const EMP_PREFIX = `BPC-${STAMP}`

interface BulkRowInput {
  employeeId: number
  documentNo: string
}

interface BulkPublishResult {
  count: number
  skips: { employeeId: number; reason: "irisan"; conflictDocumentNo: string | null }[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Tiruan blok transaksi penerbitan generateBulkPayroll (lihat header).
 * `testHoldMs` > 0 hanya alat bukti serialisasi lock (tidur sesudah lock,
 * sebelum cek ulang) — bukan perilaku produksi.
 */
async function publishLikeProduction(
  client: PrismaClient,
  args: {
    rows: BulkRowInput[]
    period: string
    rangeStart: Date
    rangeEnd: Date
    testHoldMs?: number
  },
): Promise<BulkPublishResult> {
  const { rows, period, rangeStart, rangeEnd } = args
  const skips: BulkPublishResult["skips"] = []
  if (rows.length === 0) return { count: 0, skips }
  const count = await client.$transaction(
    async (tx) => {
      const lockIds = [...new Set(rows.map((r) => r.employeeId))].sort((a, b) => a - b)
      await tx.$queryRaw`SELECT id FROM employees WHERE id IN (${Prisma.join(lockIds)}) ORDER BY id FOR UPDATE`
      if (args.testHoldMs) await sleep(args.testHoldMs)
      const freshByEmployee = new Map<number, { startDate: Date; endDate: Date; status: string; documentNo: string }[]>()
      if (lockIds.length > 0) {
        const fresh = await tx.payroll.findMany({
          where: {
            employeeId: { in: lockIds },
            status: { notIn: ["cancelled", "canceled"] },
            startDate: { lte: rangeEnd },
            endDate: { gte: new Date(rangeStart.getTime() - 90 * 24 * 60 * 60 * 1000) },
          },
          select: { employeeId: true, startDate: true, endDate: true, status: true, documentNo: true },
        })
        for (const slip of fresh) {
          if (slip.employeeId == null) continue
          const arr = freshByEmployee.get(slip.employeeId) ?? []
          arr.push(slip)
          freshByEmployee.set(slip.employeeId, arr)
        }
      }
      const keptRows: (BulkRowInput & {
        period: string
        startDate: Date
        endDate: Date
        status: string
      })[] = []
      for (const row of rows) {
        const conflict = findPayrollRangeConflict(
          freshByEmployee.get(row.employeeId) ?? [],
          rangeStart,
          rangeEnd,
        )
        if (conflict) {
          skips.push({
            employeeId: row.employeeId,
            reason: "irisan",
            conflictDocumentNo: conflict.documentNo,
          })
        } else {
          keptRows.push({ ...row, period, startDate: rangeStart, endDate: rangeEnd, status: "draft" })
        }
      }
      if (keptRows.length === 0) return 0
      await tx.payroll.createMany({ data: keptRows, skipDuplicates: true })
      return keptRows.length
    },
    { timeout: 30_000, maxWait: 15_000 },
  )
  return { count, skips }
}

describeIntegration("generateBulkPayroll konkurensi DB nyata: irisan tak identik serial per karyawan", () => {
  // Klien dibuat lambat di beforeAll: callback describe tetap dievaluasi
  // saat koleksi walau suite di-skip (URL belum tentu ada).
  let clientA: PrismaClient
  let clientB: PrismaClient
  let overlapId = 0
  let onlyAId = 0
  let onlyBId = 0
  let blockOverlapId = 0
  let blockOnlyId = 0

  async function createEmployee(client: PrismaClient, suffix: string) {
    const employee = await client.employee.create({
      data: {
        employeeNo: `${EMP_PREFIX}-${suffix}`,
        name: `Bulk Payroll Concurrency ${suffix} ${STAMP}`,
        joinDate: new Date("2020-01-01T00:00:00.000Z"),
      },
    })
    return employee.id
  }

  beforeAll(async () => {
    clientA = createTestClient()
    clientB = createTestClient()
    overlapId = await createEmployee(clientA, "overlap")
    onlyAId = await createEmployee(clientA, "only-a")
    onlyBId = await createEmployee(clientA, "only-b")
    blockOverlapId = await createEmployee(clientA, "block-overlap")
    blockOnlyId = await createEmployee(clientA, "block-only")
  })

  afterAll(async () => {
    await clientA.payroll.deleteMany({ where: { documentNo: { startsWith: DOC_PREFIX } } })
    await clientA.employee.deleteMany({ where: { employeeNo: { startsWith: EMP_PREFIX } } })
    await clientA.$disconnect()
    await clientB.$disconnect()
  })

  it("dua run konkuren rentang beririsan tak identik: tepat satu slip karyawan tumpang-tindih, kalah skip irisan, non-irisan tetap terbit", async () => {
    // Run A: 1-31 Jan untuk [overlap, onlyA]. Run B: 15 Jan-15 Feb untuk
    // [overlap, onlyB]. Rentang overlap BERIRISAN TAK IDENTIK, jadi kunci
    // unik (employeeId, startDate, endDate) tidak bisa menyelamatkan —
    // hanya lock + cek ulang yang mencegah slip dobel.
    const rangeA = { start: new Date("2026-01-01T00:00:00.000Z"), end: new Date("2026-01-31T00:00:00.000Z") }
    const rangeB = { start: new Date("2026-01-15T00:00:00.000Z"), end: new Date("2026-02-15T00:00:00.000Z") }
    const docAOverlap = `${DOC_PREFIX}-a-overlap`
    const docBOverlap = `${DOC_PREFIX}-b-overlap`

    const results = await Promise.allSettled([
      publishLikeProduction(clientA, {
        rows: [
          { employeeId: overlapId, documentNo: docAOverlap },
          { employeeId: onlyAId, documentNo: `${DOC_PREFIX}-a-only` },
        ],
        period: "2026-01",
        rangeStart: rangeA.start,
        rangeEnd: rangeA.end,
      }),
      publishLikeProduction(clientB, {
        rows: [
          { employeeId: overlapId, documentNo: docBOverlap },
          { employeeId: onlyBId, documentNo: `${DOC_PREFIX}-b-only` },
        ],
        period: "2026-02",
        rangeStart: rangeB.start,
        rangeEnd: rangeB.end,
      }),
    ])

    // Run kalah TIDAK error: ia commit dengan skip irisan tercatat.
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"])
    const [runA, runB] = results.map(
      (r) => (r as PromiseFulfilledResult<BulkPublishResult>).value,
    )

    // Total terbit 3 (overlap 1x + onlyA + onlyB); tepat satu run skip
    // irisan untuk overlap, menyebut documentNo slip pemenang.
    expect(runA.count + runB.count).toBe(3)
    const allSkips = [...runA.skips, ...runB.skips]
    expect(allSkips).toHaveLength(1)
    expect(allSkips[0]).toMatchObject({ employeeId: overlapId, reason: "irisan" })
    const loserIsA = runA.skips.length === 1
    expect(allSkips[0].conflictDocumentNo).toBe(loserIsA ? docBOverlap : docAOverlap)
    expect(loserIsA ? runA.count : runB.count).toBe(1)
    expect(loserIsA ? runB.count : runA.count).toBe(2)

    const slips = await clientA.payroll.findMany({
      where: { documentNo: { startsWith: DOC_PREFIX } },
      select: { employeeId: true, documentNo: true },
      orderBy: { documentNo: "asc" },
    })
    expect(slips).toHaveLength(3)
    expect(slips.filter((s) => s.employeeId === overlapId)).toHaveLength(1)
    expect(slips.filter((s) => s.employeeId === onlyAId)).toHaveLength(1)
    expect(slips.filter((s) => s.employeeId === onlyBId)).toHaveLength(1)
  })

  it("lock FOR UPDATE benar-benar memblokir: run kedua belum selesai selama run pertama menahan transaksi", async () => {
    const rangeA = { start: new Date("2026-03-01T00:00:00.000Z"), end: new Date("2026-03-31T00:00:00.000Z") }
    const rangeB = { start: new Date("2026-03-15T00:00:00.000Z"), end: new Date("2026-04-15T00:00:00.000Z") }

    // Run lambat menahan lock 900ms di dalam transaksi; run cepat mulai
    // 250ms kemudian. Tanpa lock FOR UPDATE run cepat akan commit duluan
    // (atau keduanya terbit untuk blockOverlap) dan assert pending merah.
    const slowPromise = publishLikeProduction(clientA, {
      rows: [{ employeeId: blockOverlapId, documentNo: `${DOC_PREFIX}-slow-overlap` }],
      period: "2026-03",
      rangeStart: rangeA.start,
      rangeEnd: rangeA.end,
      testHoldMs: 900,
    })
    await sleep(250)
    let fastSettled = false
    const fastPromise = publishLikeProduction(clientB, {
      rows: [
        { employeeId: blockOverlapId, documentNo: `${DOC_PREFIX}-fast-overlap` },
        { employeeId: blockOnlyId, documentNo: `${DOC_PREFIX}-fast-only` },
      ],
      period: "2026-04",
      rangeStart: rangeB.start,
      rangeEnd: rangeB.end,
    }).then((value) => {
      fastSettled = true
      return value
    })

    await sleep(300)
    expect(fastSettled).toBe(false)

    const [slow, fast] = await Promise.all([slowPromise, fastPromise])
    expect(slow).toEqual({ count: 1, skips: [] })
    expect(fast.count).toBe(1)
    expect(fast.skips).toEqual([
      {
        employeeId: blockOverlapId,
        reason: "irisan",
        conflictDocumentNo: `${DOC_PREFIX}-slow-overlap`,
      },
    ])
    const slips = await clientA.payroll.findMany({
      where: { employeeId: { in: [blockOverlapId, blockOnlyId] } },
      select: { employeeId: true },
    })
    expect(slips.filter((s) => s.employeeId === blockOverlapId)).toHaveLength(1)
    expect(slips.filter((s) => s.employeeId === blockOnlyId)).toHaveLength(1)
  })
})
