import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

import {
  WORK_ORDER_OPERATION_COLUMN_LABELS,
  WORK_ORDER_OPERATION_LEVEL_LABELS,
  WORK_ORDER_OPERATION_MARKERS,
  WORK_ORDER_OPERATION_MENGENDAP_THRESHOLD_DAYS,
  WORK_ORDER_OPERATION_QUEUE_LIMIT,
  WORK_ORDER_OPERATION_QUEUE_NOTICE_TEXT,
  WORK_ORDER_OPERATION_QUEUE_TITLE,
  WORK_ORDER_OPERATION_TRUNCATED_LABEL,
  buildWorkOrderOperationQueue,
  type WorkOrderOperationQueueInput,
} from "../work-order-operation-queue"

const mocks = vi.hoisted(() => ({
  operationFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workOrderOperation: { findMany: (...a: unknown[]) => mocks.operationFindMany(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getWorkOrderOperationQueue } from "../work-order-operation-queue-data"

// 27 Okt 2026 12:00 WIB.
const NOW = new Date(Date.UTC(2026, 9, 27, 5))
const day = (offset: number) => new Date(Date.UTC(2026, 9, 27 + offset))

function input(
  overrides: Partial<WorkOrderOperationQueueInput> = {},
): WorkOrderOperationQueueInput {
  return {
    operationId: 1,
    workOrderId: 10,
    workOrderSlug: "wo-uji",
    documentNo: "WO-001",
    workOrderStatus: "in_progress",
    workOrderEndDate: day(5),
    name: "Tahap Uji",
    sortOrder: 0,
    status: "pending",
    workCenterId: 3,
    workCenterName: "Stasiun Las",
    assignedEmployeeId: 5,
    assigneeName: "Budi",
    estimatedHours: 4,
    createdAt: day(-10),
    startedAt: null,
    updatedAt: day(0),
    ...overrides,
  }
}

describe("work-order-operation-queue (F-2026-10-27-100-S)", () => {
  it("kata verbatim Q-WOOQ-2 + ambang Q-WOOQ-1 (satu konstanta server)", () => {
    expect(WORK_ORDER_OPERATION_QUEUE_TITLE).toBe("Operasi Perintah Kerja Mengendap")
    expect(WORK_ORDER_OPERATION_MENGENDAP_THRESHOLD_DAYS).toBe(7)
    expect(WORK_ORDER_OPERATION_LEVEL_LABELS).toEqual({
      BERJALAN: "BERJALAN",
      MENGENDAP: "MENGENDAP",
    })
    expect(WORK_ORDER_OPERATION_MARKERS.SEJAK_DIBUAT).toBe("SEJAK_DIBUAT")
    expect(WORK_ORDER_OPERATION_MARKERS.SEJAK_MULAI).toBe("SEJAK_MULAI")
    expect(WORK_ORDER_OPERATION_MARKERS.MULAI_TANPA_STEMPEL).toBe("MULAI_TANPA_STEMPEL")
    expect(WORK_ORDER_OPERATION_MARKERS.TERHALANG_TAHAP_SEBELUMNYA).toBe(
      "TERHALANG_TAHAP_SEBELUMNYA",
    )
    expect(WORK_ORDER_OPERATION_MARKERS.BELUM_ADA_STASIUN).toBe("BELUM_ADA_STASIUN")
    expect(WORK_ORDER_OPERATION_MARKERS.BELUM_ADA_PENANGGUNG_JAWAB).toBe(
      "BELUM_ADA_PENANGGUNG_JAWAB",
    )
    expect(WORK_ORDER_OPERATION_MARKERS.TAHAP_AKTIF_DI_WO_TIDAK_BERJALAN).toBe(
      "TAHAP_AKTIF_DI_WO_TIDAK_BERJALAN",
    )
    expect(WORK_ORDER_OPERATION_TRUNCATED_LABEL).toBe("Terpotong")
    expect(WORK_ORDER_OPERATION_COLUMN_LABELS.tingkat).toBe("Tingkat")
    expect(WORK_ORDER_OPERATION_QUEUE_NOTICE_TEXT).toContain("baca-saja")
  })

  it("AC-WOOQ-B1: populasi PERSIS pending/in_progress; completed/skipped/status liar bocor = merah", () => {
    const queue = buildWorkOrderOperationQueue(
      [
        input({ operationId: 1, name: "PENDING", status: "pending" }),
        input({ operationId: 2, name: "PROSES", status: "in_progress", startedAt: day(-2) }),
        input({ operationId: 3, name: "SELESAI", status: "completed" }),
        input({ operationId: 4, name: "LEWATI", status: "skipped" }),
        input({ operationId: 5, name: "LIAR", status: "menggantung" }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.name).sort()).toEqual(["PENDING", "PROSES"])
    expect(queue.totalPopulation).toBe(2)
    expect(queue.statusCounts).toEqual({ pending: 1, in_progress: 1 })
  })

  it("AC-WOOQ-B2: pending dari createdAt (SEJAK_DIBUAT); in_progress dari startedAt (SEJAK_MULAI), bukan createdAt", () => {
    const queue = buildWorkOrderOperationQueue(
      [
        input({ operationId: 1, name: "PENDING", status: "pending", createdAt: day(-10) }),
        input({
          operationId: 2,
          name: "PROSES",
          status: "in_progress",
          createdAt: day(-30),
          startedAt: day(-2),
        }),
      ],
      NOW,
    )
    const byName = new Map(queue.rows.map((r) => [r.name, r]))
    expect(byName.get("PENDING")?.umurHari).toBe(10)
    expect(byName.get("PENDING")?.sumberUmur).toBe("SEJAK_DIBUAT")
    expect(byName.get("PROSES")?.umurHari).toBe(2)
    expect(byName.get("PROSES")?.sumberUmur).toBe("SEJAK_MULAI")
  })

  it("AC-WOOQ-B2: updatedAt TIDAK menggerakkan umur (edit notes/penugasan stasiun)", () => {
    const base = buildWorkOrderOperationQueue(
      [input({ createdAt: day(-10), updatedAt: day(-10) })],
      NOW,
    )
    const edited = buildWorkOrderOperationQueue(
      [input({ createdAt: day(-10), updatedAt: day(0) })],
      NOW,
    )
    expect(base.rows[0].umurHari).toBe(10)
    expect(edited.rows[0].umurHari).toBe(10)
    expect(edited.rows[0].tingkat).toBe(base.rows[0].tingkat)
  })

  it("AC-WOOQ-B3: in_progress tanpa startedAt = umur null + MULAI_TANPA_STEMPEL, tetap tampil, tidak mengendap", () => {
    const queue = buildWorkOrderOperationQueue(
      [
        input({
          operationId: 1,
          name: "TANPA-STEMPEL",
          status: "in_progress",
          createdAt: day(-30),
          startedAt: null,
        }),
        input({ operationId: 2, name: "NORMAL", status: "pending", createdAt: day(-1) }),
      ],
      NOW,
    )
    const row = queue.rows.find((r) => r.name === "TANPA-STEMPEL")
    expect(row).toBeDefined()
    expect(row?.umurHari).toBeNull()
    expect(row?.tingkat).toBeNull()
    expect(row?.sumberUmur).toBe("MULAI_TANPA_STEMPEL")
    expect(row?.flags).toContain("MULAI_TANPA_STEMPEL")
    expect(queue.tanpaUmurCount).toBe(1)
    expect(queue.levelCounts).toEqual({ BERJALAN: 1, MENGENDAP: 0 })
    // Kelompok umur-null terakhir.
    expect(queue.rows[queue.rows.length - 1].name).toBe("TANPA-STEMPEL")
  })

  it("AC-WOOQ-B3/BR-WOOQ-04: estimatedHours null tertanda bukan 0; nilai verbatim apa adanya", () => {
    const queue = buildWorkOrderOperationQueue(
      [
        input({ operationId: 1, name: "KOSONG", estimatedHours: null }),
        input({ operationId: 2, name: "ADA", estimatedHours: 2.5 }),
      ],
      NOW,
    )
    const byName = new Map(queue.rows.map((r) => [r.name, r]))
    expect(byName.get("KOSONG")?.estimatedHours).toBeNull()
    expect(byName.get("ADA")?.estimatedHours).toBe(2.5)
  })

  it("AC-WOOQ-B4: tepat 7 hari = BERJALAN; 8 hari = MENGENDAP (hari kalender WIB)", () => {
    const queue = buildWorkOrderOperationQueue(
      [
        input({ operationId: 1, name: "AMBANG", createdAt: day(-7) }),
        input({ operationId: 2, name: "LEWAT-AMBANG", createdAt: day(-8) }),
        input({ operationId: 3, name: "BARU", createdAt: day(0) }),
      ],
      NOW,
    )
    const byName = new Map(queue.rows.map((r) => [r.name, r]))
    expect(byName.get("AMBANG")?.umurHari).toBe(7)
    expect(byName.get("AMBANG")?.tingkat).toBe("BERJALAN")
    expect(byName.get("LEWAT-AMBANG")?.umurHari).toBe(8)
    expect(byName.get("LEWAT-AMBANG")?.tingkat).toBe("MENGENDAP")
    expect(byName.get("BARU")?.tingkat).toBe("BERJALAN")
  })

  it("AC-WOOQ-B4: perbandingan hari kalender WIB, bukan jam mentah (mulai 7 hari kalender lalu pagi WIB)", () => {
    // Mulai 20 Okt 06:00 WIB (= 19 Okt 23:00 UTC); kini 27 Okt 08:00 WIB
    // (= 27 Okt 01:00 UTC): jam mentah 7 hari 2 jam (> 7x24) tetapi
    // hari kalender WIB tepat 7 -> BERJALAN.
    const started = new Date(Date.UTC(2026, 9, 19, 23))
    const now = new Date(Date.UTC(2026, 9, 27, 1))
    const queue = buildWorkOrderOperationQueue(
      [input({ status: "in_progress", createdAt: day(-30), startedAt: started })],
      now,
    )
    expect(queue.rows[0].umurHari).toBe(7)
    expect(queue.rows[0].tingkat).toBe("BERJALAN")
  })

  it("AC-WOOQ-B4/BR-WOOQ-05: TERHALANG_TAHAP_SEBELUMNYA persis bila tahap lebih kecil belum closed; hilang bila semua closed", () => {
    const blocked = buildWorkOrderOperationQueue(
      [
        input({ operationId: 1, name: "PERTAMA", sortOrder: 0, status: "in_progress", startedAt: day(-3) }),
        input({ operationId: 2, name: "KEDUA", sortOrder: 1, status: "pending", createdAt: day(-10) }),
      ],
      NOW,
    )
    const kedua = blocked.rows.find((r) => r.name === "KEDUA")
    expect(kedua).toBeDefined()
    expect(kedua?.blockedByName).toBe("PERTAMA")
    expect(kedua?.flags).toContain("TERHALANG_TAHAP_SEBELUMNYA")
    // Tingkat tetap mekanis dari umur (Q-WOOQ-4) walau terhalang.
    expect(kedua?.tingkat).toBe("MENGENDAP")

    const free = buildWorkOrderOperationQueue(
      [
        input({ operationId: 1, name: "PERTAMA", sortOrder: 0, status: "completed" }),
        input({ operationId: 2, name: "KEDUA", sortOrder: 1, status: "pending", createdAt: day(-10) }),
      ],
      NOW,
    )
    expect(free.rows).toHaveLength(1)
    expect(free.rows[0].blockedByName).toBeNull()
    expect(free.rows[0].flags).not.toContain("TERHALANG_TAHAP_SEBELUMNYA")
  })

  it("BR-WOOQ-06/08: stasiun/penanggung kosong tertanda; WO tidak berjalan tertanda dan TIDAK disaring", () => {
    const queue = buildWorkOrderOperationQueue(
      [
        input({
          operationId: 1,
          name: "POLOS",
          workCenterId: null,
          workCenterName: null,
          assignedEmployeeId: null,
          assigneeName: null,
          workOrderStatus: "completed",
          estimatedHours: null,
        }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    const row = queue.rows[0]
    expect(row.flags).toContain("BELUM_ADA_STASIUN")
    expect(row.flags).toContain("BELUM_ADA_PENANGGUNG_JAWAB")
    expect(row.flags).toContain("TAHAP_AKTIF_DI_WO_TIDAK_BERJALAN")
    expect(row.woTidakBerjalan).toBe(true)
    expect(row.workCenterLabel).toBe("BELUM_ADA_STASIUN")
    expect(row.assigneeLabel).toBe("BELUM_ADA_PENANGGUNG_JAWAB")
    expect(queue.stationRecap).toEqual([
      { workCenterId: null, workCenterLabel: "BELUM_ADA_STASIUN", count: 1 },
    ])
  })

  it("BR-WOOQ-10: urutan MENGENDAP(umur terbesar) -> BERJALAN -> umur-null; seri documentNo/sortOrder/id; rekap penuh + terpotong", () => {
    const inputs = [
      input({ operationId: 9, name: "NULL-UMUR", status: "in_progress", startedAt: null, createdAt: day(-40) }),
      input({ operationId: 8, name: "BERJALAN", status: "pending", createdAt: day(-2), documentNo: "WO-002" }),
      input({ operationId: 7, name: "MENGENDAP-B", status: "pending", createdAt: day(-10), documentNo: "WO-002", sortOrder: 1 }),
      input({ operationId: 6, name: "MENGENDAP-A", status: "pending", createdAt: day(-10), documentNo: "WO-001", sortOrder: 0 }),
      input({ operationId: 5, name: "MENGENDAP-TUA", status: "pending", createdAt: day(-20), documentNo: "WO-003" }),
    ]
    const queue = buildWorkOrderOperationQueue(inputs, NOW, 2)
    expect(queue.rows.map((r) => r.name)).toEqual(["MENGENDAP-TUA", "MENGENDAP-A"])
    expect(queue.terpotong).toBe(true)
    expect(queue.limit).toBe(2)
    expect(queue.totalPopulation).toBe(5)
    expect(queue.levelCounts).toEqual({ BERJALAN: 1, MENGENDAP: 3 })
    expect(queue.tanpaUmurCount).toBe(1)
    expect(queue.statusCounts).toEqual({ pending: 4, in_progress: 1 })
    expect(WORK_ORDER_OPERATION_QUEUE_LIMIT).toBe(200)

    const full = buildWorkOrderOperationQueue(inputs, NOW)
    expect(full.rows.map((r) => r.name)).toEqual([
      "MENGENDAP-TUA",
      "MENGENDAP-A",
      "MENGENDAP-B",
      "BERJALAN",
      "NULL-UMUR",
    ])
  })

  it("AC-WOOQ-B5/BR-WOOQ-09/12: payload tanpa nominal/biaya/jam aktual/notes/persen", () => {
    const queue = buildWorkOrderOperationQueue([input({})], NOW)
    const payload = JSON.stringify(queue)
    expect(payload).not.toMatch(
      /"(notes|productionCost|productionCosts|actualHours|jamAktual|nominal|biaya|cost|hpp|denda|salary|gaji|upah|percent|persen|progress)[^"]*":/i,
    )
    expect(Object.keys(queue.rows[0])).not.toContain("notes")
    // estimatedHours adalah satu-satunya angka jam dan ia verbatim.
    expect(queue.rows[0].estimatedHours).toBe(4)
  })

  it("EC-WOOQ-8: nama tahap sama pada WO berbeda dibedakan documentNo + id, tidak digabung", () => {
    const queue = buildWorkOrderOperationQueue(
      [
        input({ operationId: 1, name: "Las", documentNo: "WO-001", workOrderId: 10 }),
        input({ operationId: 2, name: "Las", documentNo: "WO-002", workOrderId: 20, workOrderSlug: "wo-lain" }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(2)
    expect(queue.rows.map((r) => r.documentNo)).toEqual(["WO-001", "WO-002"])
  })
})

describe("getWorkOrderOperationQueue (loader fail-closed, AC-WOOQ-B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.operationFindMany.mockResolvedValue([])
  })

  it("tanpa izin menolak SEBELUM query (view_work_orders persis)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getWorkOrderOperationQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_work_orders")
    expect(mocks.operationFindMany).not.toHaveBeenCalled()
  })

  it("satu query massal operasi+WO+stasiun+penanggung (anti-N+1); hasil ke builder", async () => {
    mocks.operationFindMany.mockResolvedValue([
      {
        id: 7,
        workOrderId: 10,
        workCenterId: null,
        name: "Tahap Loader",
        sortOrder: 0,
        status: "pending",
        estimatedHours: null,
        assignedEmployeeId: null,
        startedAt: null,
        createdAt: day(-9),
        updatedAt: day(0),
        workOrder: { slug: "wo-7", documentNo: "WO-007", status: "in_progress", endDate: null },
        workCenter: null,
        assignedEmployee: null,
      },
    ])
    const queue = await getWorkOrderOperationQueue({ now: NOW })
    expect(mocks.operationFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.operationFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: { in: ["pending", "in_progress"] } })
    expect(arg.select.workOrder).toBeDefined()
    expect(arg.select.workCenter).toBeDefined()
    expect(arg.select.assignedEmployee).toBeDefined()
    expect(arg.select.notes).toBeUndefined()
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].tingkat).toBe("MENGENDAP")
    expect(queue.rows[0].flags).toContain("BELUM_ADA_STASIUN")
  })
})

describe("wiring permukaan antrean operasi WO (AC-WOOQ-B5/F1..F3)", () => {
  const root = process.cwd()
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8")
  const builderSource = read("src/lib/reports/work-order-operation-queue.ts")
  const loaderSource = read("src/lib/reports/work-order-operation-queue-data.ts")
  const uiSource = read(
    "src/app/(dashboard)/produksi/perintah-kerja/_components/work-order-operation-queue.tsx",
  )
  const pageSource = read("src/app/(dashboard)/produksi/perintah-kerja/page.tsx")

  it("AC-WOOQ-B5: builder+loader baca-saja, gerbang view_work_orders sebelum query, tanpa aksi tulis WO/operasi", () => {
    expect(builderSource + loaderSource).not.toMatch(
      /updateWorkOrderOperationStatus|initializeWorkOrderOperations/,
    )
    expect(loaderSource).not.toMatch(/\.update\(|\.create\(|\.delete\(|updateMany|deleteMany|createMany/)
    expect(loaderSource).toContain('requirePermission("view_work_orders")')
    expect(loaderSource.indexOf('requirePermission("view_work_orders")')).toBeLessThan(
      loaderSource.indexOf("prisma.workOrderOperation.findMany"),
    )
    expect(loaderSource).not.toMatch(/timesheet|productionCost|materialIssue/i)
  })

  it("AC-WOOQ-F1: UI verbatim payload — tanpa hitung umur/tingkat/urutan/rekap sendiri", () => {
    expect(uiSource).not.toMatch(/\.sort\(|wibDayNumber|getTime\(\)|86400|86_400|Date\.now/)
    expect(uiSource).toContain("WORK_ORDER_OPERATION_QUEUE_TITLE")
    expect(uiSource).toContain("row.umurLabel")
    expect(uiSource).toContain("row.sumberUmur")
    expect(uiSource).toContain("row.tingkatLabel")
    expect(uiSource).toContain("queue.levelCounts")
    expect(uiSource).toContain("queue.stationRecap")
  })

  it("AC-WOOQ-F2: tanpa tombol tulis dari antrean; tautan hanya ke detail WO existing", () => {
    expect(uiSource).not.toMatch(/<button|onPress=|onClick=/)
    expect(uiSource).not.toMatch(
      /updateWorkOrderOperationStatus|setWorkOrderOperationWorkCenter|>\s*(Mulai|Selesai|Lewati|Buka Ulang|Tugaskan)\s*</,
    )
    expect(uiSource).toContain('entityHref("/produksi/perintah-kerja"')
  })

  it("AC-WOOQ-F3: semua penanda + terpotong tampil; halaman menolak tanpa izin dan daftar WO existing utuh", () => {
    expect(uiSource).toContain("WORK_ORDER_OPERATION_MARKERS.MULAI_TANPA_STEMPEL")
    expect(uiSource).toContain("WORK_ORDER_OPERATION_MARKERS.TERHALANG_TAHAP_SEBELUMNYA")
    expect(uiSource).toContain("WORK_ORDER_OPERATION_TRUNCATED_LABEL")
    expect(uiSource).toContain("row.flags")
    expect(pageSource).toContain("getWorkOrderOperationQueue")
    expect(pageSource).toContain("WorkOrderOperationQueueSection")
    expect(pageSource).toContain("WorkOrderTable")
    expect(pageSource).toContain('requirePermission("view_work_orders")')
    expect(pageSource).toContain('orderBy: { createdAt: "desc" }')
  })
})
