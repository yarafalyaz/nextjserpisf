import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DISCIPLINARY_QUEUE_COLUMN_LABELS,
  DISCIPLINARY_QUEUE_EMPTY_TEXT,
  DISCIPLINARY_QUEUE_NOTICE_TEXT,
  DISCIPLINARY_QUEUE_STAGE_LABELS,
  DISCIPLINARY_QUEUE_STALE_DAYS,
  DISCIPLINARY_QUEUE_TIER_LABELS,
  DISCIPLINARY_QUEUE_TITLE,
  buildDisciplinaryQueue,
  type DisciplinaryQueueRecordInput,
} from "../disciplinary-queue"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
  recFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...args: unknown[]) => mocks.requirePermission(...args),
}))
vi.mock("@/lib/auth/hr-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/hr-scope")>()
  return {
    ...actual,
    getHrScope: (...args: unknown[]) => mocks.getHrScope(...args),
  }
})
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employeeDisciplinaryRecord: {
      findMany: (...a: unknown[]) => mocks.recFindMany(...a),
    },
  },
}))

import { loadDisciplinaryQueue } from "../disciplinary-queue-data"

// 2026-10-27 10:00 WIB = 03:00 UTC.
const NOW = new Date("2026-10-27T03:00:00.000Z")
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

const FORBIDDEN = [
  "description",
  "regulationReference",
  "employeeResponse",
  "rejectionReason",
  "voidReason",
] as const

function rec(
  over: Partial<DisciplinaryQueueRecordInput> = {},
): DisciplinaryQueueRecordInput {
  return {
    id: 1,
    employeeId: 10,
    employeeName: "Budi",
    departmentName: "Bengkel",
    level: "sp1",
    violationCategory: "mangkir tanpa keterangan berulang",
    violationDate: d("2026-10-20"),
    workflowStatus: "draft",
    requestedBy: 7,
    requesterName: "Atasan",
    approvedBy: null,
    secondApprovedBy: null,
    documentNo: null,
    voidOfId: null,
    voidedAt: null,
    deletedAt: null,
    createdAt: d("2026-10-25"),
    ...over,
  }
}

describe("disciplinary-queue builder (TASK-040, Q-DQ-1/2/5)", () => {
  it("kata tampil verbatim Q-DQ-2 + ambang Q-DQ-1", () => {
    expect(DISCIPLINARY_QUEUE_TITLE).toBe("Rekod Disiplin Belum Terbit")
    expect(DISCIPLINARY_QUEUE_STAGE_LABELS).toEqual({
      draft: "Belum Diajukan",
      pending_approval: "Menunggu Persetujuan",
    })
    expect(DISCIPLINARY_QUEUE_TIER_LABELS).toEqual({
      mengendap: "Mengendap",
      menunggu: "Menunggu",
    })
    expect(DISCIPLINARY_QUEUE_STALE_DAYS).toBe(3)
    expect(DISCIPLINARY_QUEUE_EMPTY_TEXT).toBe(
      "Tidak ada rekod disiplin yang belum terbit.",
    )
    expect(DISCIPLINARY_QUEUE_NOTICE_TEXT).toContain("belum terbit")
    expect(DISCIPLINARY_QUEUE_COLUMN_LABELS.karyawan).toBe("Karyawan")
  })

  it("AC-DQ-B1: populasi persis draft+pending terpisah; issued/rejected/voided/deleted/pembatal/status-asing keluar", () => {
    const queue = buildDisciplinaryQueue(
      [
        rec({ id: 1, workflowStatus: "draft" }),
        rec({ id: 2, workflowStatus: "pending_approval" }),
        rec({ id: 3, workflowStatus: "issued" }),
        rec({ id: 4, workflowStatus: "rejected" }),
        rec({ id: 5, workflowStatus: "draft", voidedAt: d("2026-10-26") }),
        rec({ id: 6, workflowStatus: "pending_approval", deletedAt: d("2026-10-26") }),
        rec({ id: 7, workflowStatus: "pending_approval", voidOfId: 99 }),
        rec({ id: 8, workflowStatus: "status_asing" }),
        rec({ id: 9, workflowStatus: "active" }),
      ],
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.id)).toEqual([1, 2])
    expect(queue.draft.map((r) => r.id)).toEqual([1])
    expect(queue.pendingApproval.map((r) => r.id)).toEqual([2])
    expect(queue.summary).toEqual({
      draft: 1,
      pending_approval: 1,
      mengendap: 0,
      menunggu: 2,
      total: 2,
    })
    expect(queue.draft[0]?.stageLabel).toBe("Belum Diajukan")
    expect(queue.pendingApproval[0]?.stageLabel).toBe("Menunggu Persetujuan")
  })

  it("AC-DQ-B2/B5: serialisasi payload tanpa isi kasus, tanpa nominal/potongan, tanpa turunan persetujuan", () => {
    const queue = buildDisciplinaryQueue(
      [
        rec({
          id: 1,
          level: "sp3",
          workflowStatus: "pending_approval",
          approvedBy: 8,
          secondApprovedBy: null,
        }),
      ],
      { now: NOW },
    )
    const row = queue.rows[0]
    // EC-DQ-1: fakta verbatim apa adanya.
    expect(row?.approvedBy).toBe(8)
    expect(row?.secondApprovedBy).toBeNull()
    expect(row?.levelLabel).toBe("Surat Peringatan 3 (SP3)")

    const serialized = JSON.stringify(queue)
    for (const key of FORBIDDEN) expect(serialized).not.toContain(key)
    for (const banned of [
      "salary",
      "gaji",
      "nominal",
      "deduction",
      "potongan",
      "missingApproval",
      "kurangPersetujuan",
      "approvalStep",
      "langkahPersetujuan",
      "menungguPenyetuju",
      "needsSecond",
      "updatedAt",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(banned.toLowerCase())
    }
    expect(row).not.toHaveProperty("description")
    expect(row).not.toHaveProperty("updatedAt")
  })

  it("AC-DQ-B4: umur hari kalender WIB dari createdAt walau updatedAt jauh lebih baru; urutan createdAt naik + id naik; mengendap >=3", () => {
    const withUpdated = {
      ...rec({ id: 2, createdAt: d("2026-10-24") }),
      updatedAt: d("2026-10-27"),
    } as DisciplinaryQueueRecordInput
    const queue = buildDisciplinaryQueue(
      [
        rec({ id: 5, createdAt: d("2026-10-25") }),
        withUpdated,
        rec({ id: 3, createdAt: d("2026-10-24") }),
        rec({ id: 9, createdAt: d("2026-10-26") }),
      ],
      { now: NOW },
    )
    // createdAt 24 (id 2,3) -> 25 (id5) -> 26 (id9); seri id naik.
    expect(queue.rows.map((r) => r.id)).toEqual([2, 3, 5, 9])
    const byId = new Map(queue.rows.map((r) => [r.id, r]))
    // WIB: NOW 27 Okt; created 24 Okt = 3 hari -> mengendap, bukan dari updatedAt (0 hari).
    expect(byId.get(2)?.umurMenungguHari).toBe(3)
    expect(byId.get(2)?.tier).toBe("mengendap")
    expect(byId.get(2)?.tierLabel).toBe("Mengendap")
    expect(byId.get(5)?.umurMenungguHari).toBe(2)
    expect(byId.get(5)?.tier).toBe("menunggu")
    expect(byId.get(9)?.umurMenungguHari).toBe(1)

    // Batas persis: 3 hari mengendap, 2 hari menunggu; masa depan tidak negatif.
    const edge = buildDisciplinaryQueue(
      [rec({ id: 1, createdAt: d("2026-10-28") })],
      { now: NOW },
    )
    expect(edge.rows[0]?.umurMenungguHari).toBe(0)
    expect(edge.rows[0]?.tier).toBe("menunggu")
  })

  it("EC-DQ-4/6/7/8: violationDate masa depan tidak mengubah umur; verbal ikut; level asing verbatim; dua rekod karyawan sama terpisah; documentNo verbatim", () => {
    const queue = buildDisciplinaryQueue(
      [
        rec({
          id: 1,
          level: "verbal",
          workflowStatus: "draft",
          violationDate: d("2027-01-01"),
          documentNo: "001/SP/YRA/01/2026",
        }),
        rec({ id: 2, level: "jenjang-asing", workflowStatus: "pending_approval" }),
      ],
      { now: NOW },
    )
    expect(queue.rows).toHaveLength(2)
    expect(queue.rows[0]?.levelLabel).toBe("Teguran Lisan Tercatat")
    expect(queue.rows[0]?.umurMenungguHari).toBe(2)
    expect(queue.rows[0]?.documentNo).toBe("001/SP/YRA/01/2026")
    expect(queue.rows[0]?.workflowStatus).toBe("draft")
    expect(queue.rows[1]?.level).toBe("jenjang-asing")
    expect(queue.rows[1]?.levelLabel).toBe("jenjang-asing")
  })
})

describe("disciplinary-queue loader (AC-DQ-B2/B3/B5)", () => {
  function dbRow(over: Record<string, unknown> = {}) {
    return {
      id: 1,
      employeeId: 10,
      level: "sp1",
      violationCategory: "mangkir tanpa keterangan berulang",
      violationDate: d("2026-10-20"),
      workflowStatus: "draft",
      requestedBy: 7,
      approvedBy: null,
      secondApprovedBy: null,
      documentNo: null,
      voidOfId: null,
      voidedAt: null,
      deletedAt: null,
      createdAt: d("2026-10-24"),
      updatedAt: d("2026-10-27"),
      employee: { name: "Budi", department: { name: "Bengkel" } },
      requester: { name: "Atasan" },
      ...over,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: ["hr"] })
    mocks.getHrScope.mockResolvedValue({ kind: "all" })
    mocks.recFindMany.mockResolvedValue([dbRow()])
  })

  it("gerbang izin sebelum query; satu query massal; where populasi + orderBy tertua dulu", async () => {
    const queue = await loadDisciplinaryQueue({ now: NOW })
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "view_disciplinary_records",
    )
    expect(mocks.recFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.recFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      workflowStatus: { in: ["draft", "pending_approval"] },
      voidedAt: null,
      deletedAt: null,
      voidOfId: null,
    })
    expect(arg.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }])
    // Umur dari createdAt (24 Okt -> 3 hari), bukan updatedAt loader.
    expect(queue.rows[0]?.umurMenungguHari).toBe(3)
    expect(queue.rows[0]?.tier).toBe("mengendap")
  })

  it("AC-DQ-B2: select eksplisit tanpa isi kasus dan tanpa updatedAt; payload hasil bersih", async () => {
    const queue = await loadDisciplinaryQueue({ now: NOW })
    const arg = mocks.recFindMany.mock.calls[0][0]
    const selectText = JSON.stringify(arg.select)
    for (const key of FORBIDDEN) expect(selectText).not.toContain(key)
    expect(selectText).not.toContain("updatedAt")
    expect(selectText).not.toMatch(/salary|nominal|deduction/i)
    expect(arg.select.employee).toEqual({
      select: { name: true, department: { select: { name: true } } },
    })
    const payload = JSON.stringify(queue)
    for (const key of FORBIDDEN) expect(payload).not.toContain(key)
  })

  it("AC-DQ-B3: tanpa izin loader menolak sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("ditolak"))
    await expect(loadDisciplinaryQueue({ now: NOW })).rejects.toThrow("ditolak")
    expect(mocks.recFindMany).not.toHaveBeenCalled()
  })

  it("AC-DQ-B3: scope self/department/team membatasi where query yang sama; roles rusak -1 nol baris", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: 42 })
    await loadDisciplinaryQueue({ now: NOW })
    expect(mocks.recFindMany.mock.calls[0][0].where).toMatchObject({
      employeeId: 42,
    })

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: [] })
    mocks.getHrScope.mockResolvedValue({
      kind: "department",
      departmentId: 3,
      employeeId: 9,
    })
    mocks.recFindMany.mockResolvedValue([])
    await loadDisciplinaryQueue({ now: NOW })
    expect(mocks.recFindMany.mock.calls[0][0].where).toMatchObject({
      employee: { departmentId: 3 },
    })

    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7", roles: [] })
    mocks.getHrScope.mockResolvedValue({ kind: "self", employeeId: -1 })
    mocks.recFindMany.mockResolvedValue([])
    const empty = await loadDisciplinaryQueue({ now: NOW })
    expect(mocks.recFindMany.mock.calls[0][0].where).toMatchObject({
      employeeId: -1,
    })
    expect(empty.rows).toEqual([])
    expect(empty.summary.total).toBe(0)
  })
})
