import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

import {
  PROJECT_TASK_BUCKET_LABELS,
  PROJECT_TASK_COLUMN_LABELS,
  PROJECT_TASK_MENDEKATI_MAX_DAYS,
  PROJECT_TASK_QUEUE_LIMIT,
  PROJECT_TASK_QUEUE_NOTICE_TEXT,
  PROJECT_TASK_QUEUE_TITLE,
  PROJECT_TASK_UNASSIGNED_LABEL,
  PROJECT_TASK_UNKNOWN_STATUS_LABEL,
  buildProjectTaskQueue,
  type ProjectTaskQueueInput,
} from "../project-task-queue"

const mocks = vi.hoisted(() => ({
  taskFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    task: { findMany: (...a: unknown[]) => mocks.taskFindMany(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getProjectTaskQueue } from "../project-task-queue-data"

// Hari kalender WIB 27 Okt 2026; dueDate tersimpan tengah malam UTC hari WIB.
const NOW = new Date(Date.UTC(2026, 9, 27, 5)) // 12:00 WIB
const due = (offset: number) => new Date(Date.UTC(2026, 9, 27 + offset))
const created = (offset: number) => new Date(Date.UTC(2026, 8, 1 + offset))

function input(overrides: Partial<ProjectTaskQueueInput> = {}): ProjectTaskQueueInput {
  return {
    taskId: 1,
    slug: "tugas-uji",
    name: "Tugas Uji",
    status: "pending",
    projectId: 10,
    projectName: "Proyek Uji",
    assignedTo: 5,
    assigneeName: "Budi",
    dueDate: due(-10),
    createdAt: created(0),
    startDate: due(-20),
    updatedAt: due(0),
    ...overrides,
  }
}

describe("project-task-queue (F-2026-10-27-091-S)", () => {
  it("kata verbatim Q-PTQ-2 + ambang Q-PTQ-1 + notice batas Q-PTQ-3", () => {
    expect(PROJECT_TASK_QUEUE_TITLE).toBe("Tugas Proyek Lewat Tenggat")
    expect(PROJECT_TASK_MENDEKATI_MAX_DAYS).toBe(3)
    expect(PROJECT_TASK_UNASSIGNED_LABEL).toBe("Belum ditugaskan")
    expect(PROJECT_TASK_UNKNOWN_STATUS_LABEL).toBe("Status Tidak Dikenal")
    expect(PROJECT_TASK_BUCKET_LABELS.LEWAT_TENGGAT).toBe("Lewat Tenggat")
    expect(PROJECT_TASK_BUCKET_LABELS.TANPA_TENGGAT).toBe("Tanpa Tenggat")
    expect(PROJECT_TASK_COLUMN_LABELS.keterlambatan).toBe("Keterlambatan")
    expect(PROJECT_TASK_QUEUE_NOTICE_TEXT).toContain("lintas penugasan")
    expect(PROJECT_TASK_QUEUE_NOTICE_TEXT).toContain("baca-saja")
  })

  it("AC-PTQ-B1: populasi persis pending/in_progress; completed/cancelled bocor = merah", () => {
    const queue = buildProjectTaskQueue(
      [
        input({ taskId: 1, name: "PENDING", status: "pending" }),
        input({ taskId: 2, name: "PROSES", status: "in_progress" }),
        input({ taskId: 3, name: "SELESAI", status: "completed" }),
        input({ taskId: 4, name: "BATAL", status: "cancelled" }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.name)).toEqual(["PENDING", "PROSES"])
    expect(queue.totalPopulation).toBe(2)
    expect(queue.statusCounts).toEqual({ pending: 1, in_progress: 1 })
  })

  it("AC-PTQ-B1/BR-PTQ-02: status liar (termasuk skipped khas ProjectStage) tertanda, tetap populasi, tidak masuk rekap dikenal", () => {
    const queue = buildProjectTaskQueue(
      [
        input({ taskId: 1, name: "LIAR", status: "menggantung" }),
        input({ taskId: 2, name: "SKIP", status: "skipped" }),
        input({ taskId: 3, name: "NORMAL", status: "pending" }),
      ],
      NOW,
    )
    expect(queue.totalPopulation).toBe(3)
    expect(queue.unknownStatusCount).toBe(2)
    expect(queue.statusCounts).toEqual({ pending: 1, in_progress: 0 })
    const liar = queue.rows.find((r) => r.name === "LIAR")
    expect(liar?.statusTidakDikenal).toBe(true)
    expect(liar?.statusLabel).toBe("Status Tidak Dikenal")
    expect(liar?.status).toBe("menggantung")
    expect(liar?.flags).toContain("Status Tidak Dikenal")
  })

  it("AC-PTQ-B2: kemarin WIB = LEWAT_TENGGAT umur >= 1; hari ini sisa 0 BUKAN lewat (siang WIB)", () => {
    const soreWib = new Date(Date.UTC(2026, 9, 27, 10)) // 17:00 WIB
    const queue = buildProjectTaskQueue(
      [
        input({ taskId: 1, name: "KEMARIN", dueDate: due(-1) }),
        input({ taskId: 2, name: "HARI-INI", dueDate: due(0) }),
        input({ taskId: 3, name: "AMBANG", dueDate: due(3) }),
        input({ taskId: 4, name: "JAUH", dueDate: due(4) }),
      ],
      soreWib,
    )
    const byName = new Map(queue.rows.map((r) => [r.name, r]))
    expect(byName.get("KEMARIN")?.bucket).toBe("LEWAT_TENGGAT")
    expect(byName.get("KEMARIN")?.umurLewatHari).toBe(1)
    expect(byName.get("KEMARIN")?.keterlambatanLabel).toBe("Terlambat 1 hari")
    expect(byName.get("HARI-INI")?.bucket).toBe("MENDEKATI")
    expect(byName.get("HARI-INI")?.sisaHari).toBe(0)
    expect(byName.get("HARI-INI")?.umurLewatHari).toBeNull()
    expect(byName.get("AMBANG")?.bucket).toBe("MENDEKATI")
    expect(byName.get("JAUH")?.bucket).toBe("BELUM_MENDESAK")
  })

  it("AC-PTQ-B2: dueDate null = TANPA_TENGGAT, sisa/umur null, tidak terlambat (null bukan epoch)", () => {
    const queue = buildProjectTaskQueue([input({ dueDate: null })], NOW)
    expect(queue.rows[0].bucket).toBe("TANPA_TENGGAT")
    expect(queue.rows[0].sisaHari).toBeNull()
    expect(queue.rows[0].umurLewatHari).toBeNull()
    expect(queue.bucketCounts.LEWAT_TENGGAT).toBe(0)
    expect(queue.bucketCounts.TANPA_TENGGAT).toBe(1)
  })

  it("BR-PTQ-04/EC-PTQ-8: umur hanya dari dueDate — startDate lampau / mutasi createdAt+updatedAt tidak mengubah keterlambatan", () => {
    const base = buildProjectTaskQueue(
      [input({ dueDate: due(-5), startDate: due(-90), createdAt: created(0), updatedAt: due(-5) })],
      NOW,
    )
    const edited = buildProjectTaskQueue(
      [input({ dueDate: due(-5), startDate: due(30), createdAt: created(40), updatedAt: due(0) })],
      NOW,
    )
    expect(base.rows[0].umurLewatHari).toBe(5)
    expect(edited.rows[0].umurLewatHari).toBe(5)
    expect(edited.rows[0].bucket).toBe(base.rows[0].bucket)
    const future = buildProjectTaskQueue([input({ dueDate: due(10), startDate: due(-90) })], NOW)
    expect(future.rows[0].bucket).toBe("BELUM_MENDESAK")
    expect(future.rows[0].umurLewatHari).toBeNull()
  })

  it("AC-PTQ-B3/BR-PTQ-10: urutan lewat(umur terbesar) -> mendekati -> belum-mendesak -> tanpa-tenggat(tertua); seri id naik", () => {
    const queue = buildProjectTaskQueue(
      [
        input({ taskId: 9, name: "TANPA-BARU", dueDate: null, createdAt: created(5) }),
        input({ taskId: 8, name: "JAUH", dueDate: due(10) }),
        input({ taskId: 7, name: "DEKAT", dueDate: due(2) }),
        input({ taskId: 6, name: "LEWAT-B", dueDate: due(-10) }),
        input({ taskId: 5, name: "LEWAT-A", dueDate: due(-10) }),
        input({ taskId: 4, name: "LEWAT-TUA", dueDate: due(-30) }),
        input({ taskId: 3, name: "TANPA-TUA", dueDate: null, createdAt: created(0) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.name)).toEqual([
      "LEWAT-TUA",
      "LEWAT-A",
      "LEWAT-B",
      "DEKAT",
      "JAUH",
      "TANPA-TUA",
      "TANPA-BARU",
    ])
  })

  it("AC-PTQ-B3: rekap ember/status/proyek/penanggung dari populasi PENUH walau tampil terpotong", () => {
    const inputs = Array.from({ length: 5 }, (_, i) =>
      input({
        taskId: i + 1,
        name: `T-${i + 1}`,
        dueDate: due(-10),
        projectId: i % 2 === 0 ? 10 : 20,
        projectName: i % 2 === 0 ? "Proyek Uji" : "Proyek Lain",
        assignedTo: i === 4 ? null : 5,
        assigneeName: i === 4 ? null : "Budi",
      }),
    )
    const queue = buildProjectTaskQueue(inputs, NOW, 2)
    expect(queue.rows).toHaveLength(2)
    expect(queue.terpotong).toBe(true)
    expect(queue.limit).toBe(2)
    expect(queue.totalPopulation).toBe(5)
    expect(queue.bucketCounts.LEWAT_TENGGAT).toBe(5)
    expect(queue.projectRecap).toEqual([
      { projectId: 10, projectName: "Proyek Uji", count: 3 },
      { projectId: 20, projectName: "Proyek Lain", count: 2 },
    ])
    expect(queue.assigneeRecap).toContainEqual({ assignedTo: 5, assigneeLabel: "Budi", count: 4 })
    expect(queue.assigneeRecap).toContainEqual({
      assignedTo: null,
      assigneeLabel: "Belum ditugaskan",
      count: 1,
    })
    expect(PROJECT_TASK_QUEUE_LIMIT).toBe(200)
  })

  it("AC-PTQ-B4/BR-PTQ-05: penanggung null = Belum ditugaskan server; relasi menggantung tertanda, bukan Belum ditugaskan", () => {
    const queue = buildProjectTaskQueue(
      [
        input({ taskId: 1, name: "KOSONG", assignedTo: null, assigneeName: null }),
        input({ taskId: 2, name: "GANYUT", assignedTo: 99, assigneeName: null }),
        input({ taskId: 3, name: "ADA", assignedTo: 5, assigneeName: "Budi" }),
      ],
      NOW,
    )
    const byName = new Map(queue.rows.map((r) => [r.name, r]))
    expect(byName.get("KOSONG")?.assigneeLabel).toBe("Belum ditugaskan")
    expect(byName.get("KOSONG")?.belumDitugaskan).toBe(true)
    expect(byName.get("GANYUT")?.belumDitugaskan).toBe(false)
    expect(byName.get("GANYUT")?.penanggungTidakDitemukan).toBe(true)
    expect(byName.get("GANYUT")?.assigneeLabel).toBe("Penanggung Tidak Ditemukan")
    expect(byName.get("ADA")?.assigneeLabel).toBe("Budi")
  })

  it("AC-PTQ-B4/BR-PTQ-08/09: payload tanpa persen/nominal/kontak dalam bentuk apa pun", () => {
    const queue = buildProjectTaskQueue([input({})], NOW)
    const payload = JSON.stringify(queue)
    // Field/kuci terlarang sebagai KEY payload (nilai status `in_progress`
    // adalah kosakata sah, bukan persen progres).
    expect(payload).not.toMatch(
      /"(persen|percent|progress|progres|nominal|amount|grandTotal|salary|gaji|upah|denda|email|phone|telepon|kontak)[^"]*":/i,
    )
    expect(payload).not.toMatch(/%|Rp\s?\d/)
    expect(Object.keys(queue.rows[0])).not.toContain("progress")
  })

  it("BR-PTQ-11: proyek induk berstatus apa pun tidak disaring builder (tanpa field status proyek)", () => {
    const queue = buildProjectTaskQueue(
      [input({ projectName: "Proyek Ditutup" })],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].projectName).toBe("Proyek Ditutup")
  })
})

describe("getProjectTaskQueue (loader fail-closed, AC-PTQ-B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.taskFindMany.mockResolvedValue([])
  })

  it("tanpa izin menolak SEBELUM query; tanpa saring per penugasan", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getProjectTaskQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_projects")
    expect(mocks.taskFindMany).not.toHaveBeenCalled()
  })

  it("satu query massal include project+assignee, hanya terminal dikecualikan; hasil ke builder", async () => {
    mocks.taskFindMany.mockResolvedValue([
      {
        id: 7,
        slug: "tugas-7",
        name: "Tugas Loader",
        status: "in_progress",
        projectId: 10,
        assignedTo: null,
        dueDate: due(-2),
        startDate: due(-9),
        createdAt: created(0),
        updatedAt: due(0),
        project: { name: "Proyek Uji" },
        assignee: null,
      },
    ])
    const queue = await getProjectTaskQueue({ now: NOW })
    expect(mocks.taskFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.taskFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: { notIn: ["completed", "cancelled"] } })
    expect(arg.select.project).toBeDefined()
    expect(arg.select.assignee).toBeDefined()
    expect(arg.where.assignedTo).toBeUndefined()
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].bucket).toBe("LEWAT_TENGGAT")
    expect(queue.rows[0].assigneeLabel).toBe("Belum ditugaskan")
  })
})

describe("wiring permukaan antrean tugas proyek (AC-PTQ-B5/F1..F3)", () => {
  const root = process.cwd()
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8")
  const builderSource = read("src/lib/reports/project-task-queue.ts")
  const loaderSource = read("src/lib/reports/project-task-queue-data.ts")
  const uiSource = read("src/app/(dashboard)/proyek/tugas/_components/project-task-queue.tsx")
  const pageSource = read("src/app/(dashboard)/proyek/tugas/page.tsx")

  it("AC-PTQ-B5: builder+loader baca-saja, gerbang view_projects sebelum query", () => {
    expect(builderSource + loaderSource).not.toMatch(/createTask|updateTask|deleteTask/)
    expect(loaderSource).not.toMatch(/\.update\(|\.create\(|\.delete\(|updateMany|deleteMany/)
    expect(loaderSource).toContain('requirePermission("view_projects")')
    expect(loaderSource.indexOf('requirePermission("view_projects")')).toBeLessThan(
      loaderSource.indexOf("prisma.task.findMany"),
    )
  })

  it("AC-PTQ-F1: UI verbatim payload — tanpa hitung ember/umur/urutan/rekap sendiri", () => {
    expect(uiSource).not.toMatch(/\.sort\(|wibDayNumber|getTime\(\)|86400|86_400|Date\.now/)
    expect(uiSource).toContain("PROJECT_TASK_QUEUE_TITLE")
    expect(uiSource).toContain("row.bucketLabel")
    expect(uiSource).toContain("row.keterlambatanLabel")
    expect(uiSource).toContain("queue.bucketCounts")
    expect(uiSource).toContain("queue.projectRecap")
    expect(uiSource).toContain("queue.assigneeRecap")
  })

  it("AC-PTQ-F2: tanpa tombol tulis dari antrean; tautan hanya ke detail tugas existing", () => {
    expect(uiSource).not.toMatch(/<button|onPress=|onClick=|createTask|updateTask|deleteTask/)
    expect(uiSource).not.toMatch(/>\s*(Selesai|Ubah|Tugaskan|Hapus)\s*</)
    expect(uiSource).toContain('entityHref("/proyek/tugas"')
    expect(uiSource).not.toMatch(/href="\/proyek\/(?!tugas)/)
  })

  it("AC-PTQ-F3: baris tertanda tampil; halaman menolak tanpa izin dan daftar existing tidak berubah", () => {
    expect(uiSource).toContain("PROJECT_TASK_UNKNOWN_STATUS_LABEL")
    expect(uiSource).toContain("PROJECT_TASK_UNASSIGNED_LABEL")
    expect(uiSource).toContain("PROJECT_TASK_TRUNCATED_LABEL")
    expect(uiSource).toContain("row.flags")
    expect(pageSource).toContain("getProjectTaskQueue")
    expect(pageSource).toContain("ProjectTaskQueueSection")
    expect(pageSource).toContain("TaskTable")
    expect(pageSource).toContain('requirePermission("view_projects")')
    expect(pageSource).toContain("orderBy: { createdAt: \"desc\" }")
  })
})
