import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

import {
  PROJECT_STAGE_COLUMN_LABELS,
  PROJECT_STAGE_IN_COMPLETED_PROJECT_LABEL,
  PROJECT_STAGE_LEVEL_LABELS,
  PROJECT_STAGE_MENGENDAP_THRESHOLD_DAYS,
  PROJECT_STAGE_QUEUE_LIMIT,
  PROJECT_STAGE_QUEUE_NOTICE_TEXT,
  PROJECT_STAGE_QUEUE_TITLE,
  PROJECT_STAGE_SOURCE_LABELS,
  buildProjectStageQueue,
  type ProjectStageQueueInput,
} from "../project-stage-queue"

const mocks = vi.hoisted(() => ({
  stageFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    projectStage: { findMany: (...a: unknown[]) => mocks.stageFindMany(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getProjectStageQueue } from "../project-stage-queue-data"

// Hari kalender WIB 27 Okt 2026; tanggal tersimpan tengah malam UTC hari WIB.
const NOW = new Date(Date.UTC(2026, 9, 27, 5)) // 12:00 WIB
const day = (offset: number) => new Date(Date.UTC(2026, 9, 27 + offset))

function input(overrides: Partial<ProjectStageQueueInput> = {}): ProjectStageQueueInput {
  return {
    stageId: 1,
    stageName: "Tahap Uji",
    sortOrder: 1,
    status: "in_progress",
    startedAt: day(-20),
    updatedAt: day(0),
    projectId: 10,
    projectSlug: "proyek-uji",
    projectName: "Proyek Uji",
    projectStatus: "active",
    customerName: "Pelanggan Uji",
    progress: [{ id: 1, percentage: 40, createdAt: day(-1) }],
    ...overrides,
  }
}

describe("project-stage-queue (F-2026-10-27-092-S)", () => {
  it("kata verbatim Q-PSQ-2 + ambang Q-PSQ-1 + notice batas BR-PSQ-07", () => {
    expect(PROJECT_STAGE_QUEUE_TITLE).toBe("Tahap Proyek Berjalan Tanpa Progres Baru")
    expect(PROJECT_STAGE_MENGENDAP_THRESHOLD_DAYS).toBe(7)
    expect(PROJECT_STAGE_LEVEL_LABELS.BERJALAN).toBe("BERJALAN")
    expect(PROJECT_STAGE_LEVEL_LABELS.MENGENDAP).toBe("MENGENDAP")
    expect(PROJECT_STAGE_SOURCE_LABELS.PROGRES_TERAKHIR).toBe("PROGRES_TERAKHIR")
    expect(PROJECT_STAGE_SOURCE_LABELS.MULAI_TANPA_PROGRES).toBe("MULAI_TANPA_PROGRES")
    expect(PROJECT_STAGE_SOURCE_LABELS.TANPA_ACUAN).toBe("TANPA_ACUAN")
    expect(PROJECT_STAGE_IN_COMPLETED_PROJECT_LABEL).toBe("TAHAP_BERJALAN_DI_PROYEK_SELESAI")
    expect(PROJECT_STAGE_COLUMN_LABELS.persen).toBe("Persen Terakhir")
    expect(PROJECT_STAGE_QUEUE_NOTICE_TEXT).toContain("view_projects")
    expect(PROJECT_STAGE_QUEUE_NOTICE_TEXT).toContain("baca-saja")
    expect(PROJECT_STAGE_QUEUE_LIMIT).toBe(200)
  })

  it("AC-PSQ-B1: populasi PERSIS in_progress; pending/completed/skipped/status liar bocor = merah", () => {
    const queue = buildProjectStageQueue(
      [
        input({ stageId: 1, stageName: "BERJALAN", status: "in_progress" }),
        input({ stageId: 2, stageName: "PENDING", status: "pending" }),
        input({ stageId: 3, stageName: "SELESAI", status: "completed" }),
        input({ stageId: 4, stageName: "LEWATI", status: "skipped" }),
        input({ stageId: 5, stageName: "LIAR", status: "menggantung" }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.stageName)).toEqual(["BERJALAN"])
    expect(queue.totalPopulation).toBe(1)
  })

  it("AC-PSQ-B2: acuan = rekod terakhir (createdAt desc, id desc); seri timestamp id terbesar", () => {
    const queue = buildProjectStageQueue(
      [
        input({
          progress: [
            { id: 1, percentage: 90, createdAt: day(-10) },
            { id: 2, percentage: 30, createdAt: day(-1) },
          ],
        }),
      ],
      NOW,
    )
    expect(queue.rows[0].umurHari).toBe(1)
    expect(queue.rows[0].level).toBe("BERJALAN")
    expect(queue.rows[0].sumberUmur).toBe("PROGRES_TERAKHIR")

    const tie = buildProjectStageQueue(
      [
        input({
          progress: [
            { id: 5, percentage: 11, createdAt: day(-2) },
            { id: 9, percentage: 77, createdAt: day(-2) },
            { id: 7, percentage: 55, createdAt: day(-2) },
          ],
        }),
      ],
      NOW,
    )
    expect(tie.rows[0].persenTerakhir).toBe(77)
  })

  it("AC-PSQ-B2: updatedAt hari ini / startedAt lampau TIDAK mengnolkan umur bila rekod ada", () => {
    const queue = buildProjectStageQueue(
      [
        input({
          startedAt: day(-90),
          updatedAt: day(0),
          progress: [{ id: 1, percentage: 40, createdAt: day(-10) }],
        }),
      ],
      NOW,
    )
    expect(queue.rows[0].umurHari).toBe(10)
    expect(queue.rows[0].level).toBe("MENGENDAP")
  })

  it("EC-PSQ-2: tahap berjalan 10+ hari tetapi progres 1 hari lalu = BERJALAN", () => {
    const queue = buildProjectStageQueue(
      [input({ startedAt: day(-30), progress: [{ id: 1, percentage: 55, createdAt: day(-1) }] })],
      NOW,
    )
    expect(queue.rows[0].umurHari).toBe(1)
    expect(queue.rows[0].level).toBe("BERJALAN")
  })

  it("AC-PSQ-B3: nol rekod -> startedAt + MULAI_TANPA_PROGRES + persen null (bukan 0 karangan)", () => {
    const queue = buildProjectStageQueue(
      [input({ startedAt: day(-10), progress: [] })],
      NOW,
    )
    expect(queue.rows[0].sumberUmur).toBe("MULAI_TANPA_PROGRES")
    expect(queue.rows[0].umurHari).toBe(10)
    expect(queue.rows[0].level).toBe("MENGENDAP")
    expect(queue.rows[0].persenTerakhir).toBeNull()
    expect(queue.rows[0].persenLabel).toBeNull()
    expect(queue.rows[0].flags).toContain("MULAI_TANPA_PROGRES")
  })

  it("AC-PSQ-B3: startedAt null juga -> umur null TANPA_ACUAN, tetap tampil, tidak mengendap", () => {
    const queue = buildProjectStageQueue(
      [input({ startedAt: null, progress: [] })],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].umurHari).toBeNull()
    expect(queue.rows[0].level).toBe("TANPA_ACUAN")
    expect(queue.rows[0].sumberUmur).toBe("TANPA_ACUAN")
    expect(queue.levelCounts.MENGENDAP).toBe(0)
    expect(queue.levelCounts.TANPA_ACUAN).toBe(1)
  })

  it("AC-PSQ-B4: tepat 7 hari kalender WIB = BERJALAN; 8 hari = MENGENDAP (bukan jam mentah)", () => {
    const queue = buildProjectStageQueue(
      [
        input({ stageId: 1, stageName: "AMBANG", progress: [{ id: 1, percentage: 10, createdAt: day(-7) }] }),
        input({ stageId: 2, stageName: "LEWAT", progress: [{ id: 1, percentage: 10, createdAt: day(-8) }] }),
      ],
      NOW,
    )
    const byName = new Map(queue.rows.map((r) => [r.stageName, r]))
    expect(byName.get("AMBANG")?.umurHari).toBe(7)
    expect(byName.get("AMBANG")?.level).toBe("BERJALAN")
    expect(byName.get("LEWAT")?.umurHari).toBe(8)
    expect(byName.get("LEWAT")?.level).toBe("MENGENDAP")

    // Progres 19 Okt 17:00 WIB, kini 27 Okt 08:00 WIB: mentah 7h15m
    // (< 8x24 jam) tetapi selisih hari kalender WIB = 8 -> MENGENDAP.
    const pagiWib = new Date(Date.UTC(2026, 9, 27, 1)) // 08:00 WIB
    const soreLalu = new Date(Date.UTC(2026, 9, 19, 10)) // 19 Okt 17:00 WIB
    const calendar = buildProjectStageQueue(
      [input({ progress: [{ id: 1, percentage: 10, createdAt: soreLalu }] })],
      pagiWib,
    )
    expect(calendar.rows[0].umurHari).toBe(8)
    expect(calendar.rows[0].level).toBe("MENGENDAP")
  })

  it("AC-PSQ-B4/BR-PSQ-05: persen byte-sama rekod terakhir; rata-rata antar-rekod = merah", () => {
    const queue = buildProjectStageQueue(
      [
        input({
          progress: [
            { id: 1, percentage: 90, createdAt: day(-5) },
            { id: 2, percentage: 30, createdAt: day(-1) },
          ],
        }),
      ],
      NOW,
    )
    expect(queue.rows[0].persenTerakhir).toBe(30)
    expect(queue.rows[0].persenLabel).toBe("30%")
  })

  it("EC-PSQ-1: baru mulai pagi ini rekod bawaan 50 -> umur 0 BERJALAN persen 50 verbatim", () => {
    const queue = buildProjectStageQueue(
      [input({ startedAt: day(0), progress: [{ id: 1, percentage: 50, createdAt: day(0) }] })],
      NOW,
    )
    expect(queue.rows[0].umurHari).toBe(0)
    expect(queue.rows[0].level).toBe("BERJALAN")
    expect(queue.rows[0].persenTerakhir).toBe(50)
  })

  it("acuan masa depan (progres/startedAt impor) dijepit umur 0 BERJALAN, tidak negatif", () => {
    const fromProgress = buildProjectStageQueue(
      [input({ progress: [{ id: 1, percentage: 10, createdAt: day(1) }] })],
      NOW,
    )
    expect(fromProgress.rows[0].umurHari).toBe(0)
    expect(fromProgress.rows[0].umurLabel).toBe("0 hari")
    expect(fromProgress.rows[0].level).toBe("BERJALAN")
    const fromStart = buildProjectStageQueue(
      [input({ startedAt: day(2), progress: [] })],
      NOW,
    )
    expect(fromStart.rows[0].umurHari).toBe(0)
    expect(fromStart.rows[0].level).toBe("BERJALAN")
  })

  it("AC-PSQ-B5/BR-PSQ-08: tahap di proyek completed tampil tertanda, tidak disaring", () => {
    const queue = buildProjectStageQueue(
      [input({ projectStatus: "completed" })],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].diProyekSelesai).toBe(true)
    expect(queue.rows[0].flags).toContain("TAHAP_BERJALAN_DI_PROYEK_SELESAI")
  })

  it("BR-PSQ-10: urutan MENGENDAP(umur terbesar) -> BERJALAN -> TANPA_ACUAN; seri proyek/sortOrder/id", () => {
    const queue = buildProjectStageQueue(
      [
        input({ stageId: 9, stageName: "TANPA", startedAt: null, progress: [] }),
        input({ stageId: 8, stageName: "SEGAR", progress: [{ id: 1, percentage: 1, createdAt: day(-1) }] }),
        input({ stageId: 7, stageName: "ENDAP-B", projectName: "Beta", sortOrder: 2, progress: [{ id: 1, percentage: 1, createdAt: day(-10) }] }),
        input({ stageId: 6, stageName: "ENDAP-A2", projectName: "Alfa", sortOrder: 2, progress: [{ id: 1, percentage: 1, createdAt: day(-10) }] }),
        input({ stageId: 5, stageName: "ENDAP-A1", projectName: "Alfa", sortOrder: 1, progress: [{ id: 1, percentage: 1, createdAt: day(-10) }] }),
        input({ stageId: 4, stageName: "ENDAP-TUA", progress: [{ id: 1, percentage: 1, createdAt: day(-30) }] }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.stageName)).toEqual([
      "ENDAP-TUA",
      "ENDAP-A1",
      "ENDAP-A2",
      "ENDAP-B",
      "SEGAR",
      "TANPA",
    ])
  })

  it("BR-PSQ-10: rekap tingkat/sumber/proyek dari populasi PENUH walau tampil terpotong", () => {
    const inputs = Array.from({ length: 5 }, (_, i) =>
      input({
        stageId: i + 1,
        stageName: `T-${i + 1}`,
        projectId: i % 2 === 0 ? 10 : 20,
        projectName: i % 2 === 0 ? "Proyek Uji" : "Proyek Lain",
        progress: [{ id: 1, percentage: 10, createdAt: day(-10) }],
      }),
    )
    const queue = buildProjectStageQueue(inputs, NOW, 2)
    expect(queue.rows).toHaveLength(2)
    expect(queue.terpotong).toBe(true)
    expect(queue.limit).toBe(2)
    expect(queue.totalPopulation).toBe(5)
    expect(queue.levelCounts.MENGENDAP).toBe(5)
    expect(queue.sourceCounts.PROGRES_TERAKHIR).toBe(5)
    expect(queue.projectRecap).toEqual([
      { projectId: 10, projectName: "Proyek Uji", count: 3 },
      { projectId: 20, projectName: "Proyek Lain", count: 2 },
    ])
  })

  it("AC-PSQ-B5/BR-PSQ-09/12: payload tanpa nominal/anggaran/EV/CPI/SPI/notes dalam bentuk apa pun", () => {
    const queue = buildProjectStageQueue([input({})], NOW)
    const payload = JSON.stringify(queue)
    expect(payload).not.toMatch(
      /"(contractAmount|budget|nominal|amount|grandTotal|biaya|cost|cpi|spi|earnedValue|ev|notes)[^"]*":/i,
    )
    expect(payload).not.toMatch(/Rp\s?\d/)
    expect(Object.keys(queue.rows[0])).not.toContain("notes")
    expect(Object.keys(queue.rows[0])).not.toContain("contractAmount")
  })
})

describe("getProjectStageQueue (loader fail-closed, AC-PSQ-B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.stageFindMany.mockResolvedValue([])
  })

  it("tanpa izin menolak SEBELUM query", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getProjectStageQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_projects")
    expect(mocks.stageFindMany).not.toHaveBeenCalled()
  })

  it("satu query massal populasi persis + progres terakhir take 1 + proyek/pelanggan; hasil ke builder", async () => {
    mocks.stageFindMany.mockResolvedValue([
      {
        id: 7,
        name: "Tahap Loader",
        sortOrder: 1,
        status: "in_progress",
        startedAt: day(-20),
        updatedAt: day(0),
        projectId: 10,
        project: { slug: "proyek-uji", name: "Proyek Uji", status: "completed", customer: { name: "Pelanggan Uji" } },
        progress: [{ id: 3, percentage: 45, createdAt: day(-9) }],
      },
    ])
    const queue = await getProjectStageQueue({ now: NOW })
    expect(mocks.stageFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.stageFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: "in_progress" })
    expect(arg.select.progress).toEqual({
      select: { id: true, percentage: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
    })
    expect(arg.select.project.select.customer).toBeDefined()
    expect(JSON.stringify(arg.select)).not.toMatch(/notes|contractAmount|budgetItems/)
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].level).toBe("MENGENDAP")
    expect(queue.rows[0].persenTerakhir).toBe(45)
    expect(queue.rows[0].customerName).toBe("Pelanggan Uji")
    expect(queue.rows[0].flags).toContain("TAHAP_BERJALAN_DI_PROYEK_SELESAI")
  })
})

describe("wiring permukaan antrean tahap proyek (AC-PSQ-B5/F1..F3)", () => {
  const root = process.cwd()
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8")
  const builderSource = read("src/lib/reports/project-stage-queue.ts")
  const loaderSource = read("src/lib/reports/project-stage-queue-data.ts")
  const uiSource = read("src/app/(dashboard)/proyek/_components/project-stage-queue.tsx")
  const pageSource = read("src/app/(dashboard)/proyek/page.tsx")

  it("AC-PSQ-B5: builder+loader baca-saja, gerbang view_projects sebelum query", () => {
    expect(builderSource + loaderSource).not.toMatch(/updateProjectStageProgress|createProjectStage|deleteProjectStage/)
    expect(loaderSource).not.toMatch(/\.update\(|\.create\(|\.delete\(|updateMany|deleteMany/)
    expect(loaderSource).toContain('requirePermission("view_projects")')
    expect(loaderSource.indexOf('requirePermission("view_projects")')).toBeLessThan(
      loaderSource.indexOf("prisma.projectStage.findMany"),
    )
  })

  it("AC-PSQ-F1: UI verbatim payload — tanpa hitung umur/tingkat/urutan/rekap sendiri", () => {
    expect(uiSource).not.toMatch(/\.sort\(|wibDayNumber|getTime\(\)|86400|86_400|Date\.now/)
    expect(uiSource).toContain("PROJECT_STAGE_QUEUE_TITLE")
    expect(uiSource).toContain("row.levelLabel")
    expect(uiSource).toContain("row.umurLabel")
    expect(uiSource).toContain("row.persenLabel")
    expect(uiSource).toContain("row.sumberUmurLabel")
    expect(uiSource).toContain("queue.levelCounts")
    expect(uiSource).toContain("queue.projectRecap")
  })

  it("AC-PSQ-F2: tanpa tombol tulis dari antrean; tautan hanya ke halaman proyek existing", () => {
    expect(uiSource).not.toMatch(/<button|onPress=|onClick=|updateProjectStageProgress/)
    expect(uiSource).toContain('entityHref("/proyek"')
    expect(uiSource).not.toMatch(/href="\/proyek\/tugas/)
  })

  it("AC-PSQ-F3: baris tertanda tampil; halaman menolak tanpa izin dan daftar existing tidak berubah", () => {
    expect(uiSource).toContain("PROJECT_STAGE_IN_COMPLETED_PROJECT_LABEL")
    expect(uiSource).toContain("PROJECT_STAGE_TRUNCATED_LABEL")
    expect(uiSource).toContain("row.flags")
    expect(pageSource).toContain("getProjectStageQueue")
    expect(pageSource).toContain("ProjectStageQueueSection")
    expect(pageSource).toContain("ProjectTable")
    expect(pageSource).toContain('requirePermission("view_projects")')
    expect(pageSource).toContain('orderBy: { createdAt: "desc" }')
    // Kegagalan loader turunan terisolasi; redirect izin diteruskan.
    expect(pageSource).toContain("isNextRedirect")
    expect(pageSource).toContain("tidak dapat dimuat")
    expect(pageSource).toContain("Promise.all")
    // Sel acuan tanpa tanggal tidak menggandakan label TANPA_ACUAN.
    expect(uiSource).toContain('row.acuanTerakhir ? formatDate(row.acuanTerakhir) : "—"')
  })
})
