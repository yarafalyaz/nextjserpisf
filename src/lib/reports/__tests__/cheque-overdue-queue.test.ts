import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

import {
  CHEQUE_OVERDUE_COLUMN_LABELS,
  CHEQUE_OVERDUE_DIRECTION_LABELS,
  CHEQUE_OVERDUE_MENGENDAP_MIN_DAYS,
  CHEQUE_OVERDUE_NOTICE_TEXT,
  CHEQUE_OVERDUE_QUEUE_LIMIT,
  CHEQUE_OVERDUE_QUEUE_TITLE,
  CHEQUE_OVERDUE_TIER_LABELS,
  CHEQUE_UNKNOWN_DIRECTION_LABEL,
  CHEQUE_UNKNOWN_STATUS_LABEL,
  CHEQUE_UNKNOWN_TYPE_LABEL,
  buildChequeOverdueQueue,
  type ChequeOverdueInput,
} from "../cheque-overdue-queue"

const mocks = vi.hoisted(() => ({
  chequeFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    cheque: { findMany: (...a: unknown[]) => mocks.chequeFindMany(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getChequeOverdueQueue } from "../cheque-overdue-queue-data"

// 27 Okt 2026 (lokal), selaras pola post-dated-cheques.test.ts.
const AS_OF = new Date(2026, 9, 27)
const day = (offset: number) => new Date(2026, 9, 27 + offset)

function input(overrides: Partial<ChequeOverdueInput> = {}): ChequeOverdueInput {
  return {
    chequeId: 1,
    documentNo: "CHQ-0001",
    type: "giro",
    direction: "in",
    number: "G-100",
    party: "Pihak Uji",
    amount: 1_000_000,
    dueDate: day(-10),
    status: "pending",
    deletedAt: null,
    createdAt: day(-30),
    updatedAt: day(-30),
    ...overrides,
  }
}

describe("cheque-overdue-queue (F-2026-10-27-104-S)", () => {
  it("kata verbatim Q-CQ-2 + ambang Q-CQ-1", () => {
    expect(CHEQUE_OVERDUE_QUEUE_TITLE).toBe("Giro/Cek Lewat Jatuh Tempo Belum Cair")
    expect(CHEQUE_OVERDUE_COLUMN_LABELS.umurLewat).toBe("Umur Lewat")
    expect(CHEQUE_OVERDUE_COLUMN_LABELS.nominalTercatat).toBe("Nominal Tercatat")
    expect(CHEQUE_OVERDUE_TIER_LABELS).toEqual({
      mengendap: "Mengendap",
      lewat: "Lewat Jatuh Tempo",
      hari_ini: "Jatuh Tempo Hari Ini",
    })
    expect(CHEQUE_OVERDUE_MENGENDAP_MIN_DAYS).toBe(7)
    expect(CHEQUE_UNKNOWN_STATUS_LABEL).toBe("Status Tidak Dikenal")
    expect(CHEQUE_OVERDUE_NOTICE_TEXT).toContain("Nominal Tercatat")
  })

  it("AC-CQ-B1: hanya pending + deletedAt null + lewat/hari-ini; cleared/cancelled/terhapus bocor = merah", () => {
    const queue = buildChequeOverdueQueue(
      [
        input({ chequeId: 1, documentNo: "CHQ-LEWAT", dueDate: day(-3) }),
        input({ chequeId: 2, documentNo: "CHQ-CLEARED", status: "cleared", dueDate: day(-3) }),
        input({ chequeId: 3, documentNo: "CHQ-CANCELLED", status: "cancelled", dueDate: day(-3) }),
        input({ chequeId: 4, documentNo: "CHQ-DELETED", deletedAt: day(-1), dueDate: day(-3) }),
        input({ chequeId: 5, documentNo: "CHQ-BESOK", dueDate: day(1) }),
      ],
      AS_OF,
    )
    expect(queue.rows.map((r) => r.documentNo)).toEqual(["CHQ-LEWAT"])
    expect(queue.unknownStatusRows).toEqual([])
    expect(queue.totalPopulation).toBe(1)
  })

  it("AC-CQ-B1: status asing masuk ember tertanda, tidak dianggap pending / tidak masuk rekap", () => {
    const queue = buildChequeOverdueQueue(
      [input({ chequeId: 9, documentNo: "CHQ-ASING", status: "menggantung", dueDate: day(-2) })],
      AS_OF,
    )
    expect(queue.rows).toEqual([])
    expect(queue.totalPopulation).toBe(0)
    expect(queue.unknownStatusRows).toHaveLength(1)
    expect(queue.unknownStatusRows[0].status).toBe("menggantung")
    expect(queue.unknownStatusRows[0].statusLabel).toBe("Status Tidak Dikenal")
    expect(queue.recap.in.lewat.count).toBe(0)
  })

  it("AC-CQ-B2/EC-CQ-1: due hari ini masuk ember hari-ini persis (bukan lewat, bukan hilang)", () => {
    const queue = buildChequeOverdueQueue([input({ dueDate: day(0) })], AS_OF)
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].tier).toBe("hari_ini")
    expect(queue.rows[0].tierLabel).toBe("Jatuh Tempo Hari Ini")
    expect(queue.rows[0].umurLewat).toBe(0)
    expect(queue.rows[0].daysUntilDue).toBe(0)
    expect(queue.recap.in.hari_ini.count).toBe(1)
  })

  it("AC-CQ-B2: batas Mengendap tepat 7 hari; 6 hari masih Lewat", () => {
    const queue = buildChequeOverdueQueue(
      [
        input({ chequeId: 1, documentNo: "CHQ-6", dueDate: day(-6) }),
        input({ chequeId: 2, documentNo: "CHQ-7", dueDate: day(-7) }),
      ],
      AS_OF,
    )
    const byDoc = new Map(queue.rows.map((r) => [r.documentNo, r]))
    expect(byDoc.get("CHQ-6")?.tier).toBe("lewat")
    expect(byDoc.get("CHQ-6")?.umurLewat).toBe(6)
    expect(byDoc.get("CHQ-7")?.tier).toBe("mengendap")
    expect(byDoc.get("CHQ-7")?.umurLewat).toBe(7)
  })

  it("AC-CQ-B2: umur dari dueDate saja — mutasi createdAt/updatedAt tidak mengubah umur", () => {
    const base = buildChequeOverdueQueue(
      [input({ dueDate: day(-10), createdAt: day(-10), updatedAt: day(-10) })],
      AS_OF,
    )
    const edited = buildChequeOverdueQueue(
      [input({ dueDate: day(-10), createdAt: day(-90), updatedAt: day(0) })],
      AS_OF,
    )
    expect(base.rows[0].umurLewat).toBe(10)
    expect(edited.rows[0].umurLewat).toBe(10)
    expect(edited.rows[0].tier).toBe(base.rows[0].tier)
  })

  it("AC-CQ-B3: ember arah in/out terpisah, total tidak pernah tercampur", () => {
    const queue = buildChequeOverdueQueue(
      [
        input({ chequeId: 1, documentNo: "CHQ-IN", direction: "in", amount: 1_000_000, dueDate: day(-10) }),
        input({ chequeId: 2, documentNo: "CHQ-OUT", direction: "out", amount: 2_000_000, dueDate: day(-10) }),
      ],
      AS_OF,
    )
    expect(queue.recap.in.mengendap).toEqual({ count: 1, nominalTercatat: 1_000_000 })
    expect(queue.recap.out.mengendap).toEqual({ count: 1, nominalTercatat: 2_000_000 })
    expect(queue.recap.in.lewat.count + queue.recap.out.lewat.count).toBe(0)
    expect(CHEQUE_OVERDUE_DIRECTION_LABELS).toEqual({ in: "Diterima", out: "Dikeluarkan" })
  })

  it("AC-CQ-B3: urutan mengendap -> umur terbesar -> documentNo naik; hari-ini terakhir", () => {
    const queue = buildChequeOverdueQueue(
      [
        input({ chequeId: 1, documentNo: "CHQ-HARIINI", dueDate: day(0) }),
        input({ chequeId: 2, documentNo: "CHQ-B", dueDate: day(-10) }),
        input({ chequeId: 3, documentNo: "CHQ-A", dueDate: day(-10) }),
        input({ chequeId: 4, documentNo: "CHQ-BARU", dueDate: day(-2) }),
        input({ chequeId: 5, documentNo: "CHQ-PALINGTUA", dueDate: day(-20) }),
      ],
      AS_OF,
    )
    expect(queue.rows.map((r) => r.documentNo)).toEqual([
      "CHQ-PALINGTUA",
      "CHQ-A",
      "CHQ-B",
      "CHQ-BARU",
      "CHQ-HARIINI",
    ])
  })

  it("AC-CQ-B3/BR-CQ-11: rekap dari populasi penuh walau tampil terpotong", () => {
    const inputs = Array.from({ length: 5 }, (_, i) =>
      input({ chequeId: i + 1, documentNo: `CHQ-00${i + 1}`, dueDate: day(-10), amount: 100_000 }),
    )
    const queue = buildChequeOverdueQueue(inputs, AS_OF, 2)
    expect(queue.rows).toHaveLength(2)
    expect(queue.terpotong).toBe(true)
    expect(queue.limit).toBe(2)
    expect(queue.totalPopulation).toBe(5)
    expect(queue.recap.in.mengendap).toEqual({ count: 5, nominalTercatat: 500_000 })
    expect(CHEQUE_OVERDUE_QUEUE_LIMIT).toBeGreaterThan(0)
  })

  it("BR-CQ-04/12: arah dan jenis asing tertanda; jenis asing tidak mengubah populasi", () => {
    const queue = buildChequeOverdueQueue(
      [
        input({ chequeId: 1, documentNo: "CHQ-DIR", direction: "samping", dueDate: day(-9) }),
        input({ chequeId: 2, documentNo: "CHQ-TYPE", type: "wesel", dueDate: day(-9) }),
      ],
      AS_OF,
    )
    expect(queue.rows).toHaveLength(2)
    const dirRow = queue.rows.find((r) => r.documentNo === "CHQ-DIR")
    const typeRow = queue.rows.find((r) => r.documentNo === "CHQ-TYPE")
    expect(dirRow?.isUnknownDirection).toBe(true)
    expect(dirRow?.flags).toContain(CHEQUE_UNKNOWN_DIRECTION_LABEL)
    expect(queue.unknownDirection.count).toBe(1)
    expect(queue.recap.in.mengendap.count).toBe(1)
    expect(typeRow?.isUnknownType).toBe(true)
    expect(typeRow?.flags).toContain(CHEQUE_UNKNOWN_TYPE_LABEL)
    expect(typeRow?.typeLabel).toBe("wesel")
  })

  it("BR-CQ-06/EC-CQ-5/6: party/number kosong tetap null; amount nol/negatif verbatim; nomor sama tidak digabung", () => {
    const queue = buildChequeOverdueQueue(
      [
        input({ chequeId: 1, documentNo: "CHQ-1", number: null, party: null, amount: 0, dueDate: day(-8) }),
        input({ chequeId: 2, documentNo: "CHQ-2", number: "SAMA", party: "PT Sama", amount: -50_000, dueDate: day(-8) }),
        input({ chequeId: 3, documentNo: "CHQ-3", number: "SAMA", party: "PT Sama", amount: 10_000, dueDate: day(-8) }),
      ],
      AS_OF,
    )
    expect(queue.rows).toHaveLength(3)
    expect(queue.rows.find((r) => r.documentNo === "CHQ-1")?.number).toBeNull()
    expect(queue.rows.find((r) => r.documentNo === "CHQ-1")?.party).toBeNull()
    expect(queue.recap.in.mengendap.nominalTercatat).toBe(-40_000)
  })
})

describe("getChequeOverdueQueue (loader fail-closed, AC-CQ-B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.chequeFindMany.mockResolvedValue([])
  })

  it("tanpa izin menolak SEBELUM query", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getChequeOverdueQueue({ asOf: AS_OF })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_cheques")
    expect(mocks.chequeFindMany).not.toHaveBeenCalled()
  })

  it("satu query deletedAt null; hasil diteruskan ke builder", async () => {
    mocks.chequeFindMany.mockResolvedValue([
      {
        id: 7,
        documentNo: "CHQ-0007",
        type: "cek",
        direction: "out",
        number: null,
        party: null,
        amount: 250000,
        dueDate: day(-8),
        status: "pending",
        deletedAt: null,
        createdAt: day(-40),
        updatedAt: day(0),
      },
    ])
    const queue = await getChequeOverdueQueue({ asOf: AS_OF })
    expect(mocks.chequeFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.chequeFindMany.mock.calls[0][0].where).toEqual({ deletedAt: null })
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].tier).toBe("mengendap")
    expect(queue.rows[0].umurLewat).toBe(8)
  })
})

describe("wiring permukaan antrean giro (AC-CQ-F1..F3, BR-CQ-05/07)", () => {
  const root = process.cwd()
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8")
  const builderSource = read("src/lib/reports/cheque-overdue-queue.ts")
  const loaderSource = read("src/lib/reports/cheque-overdue-queue-data.ts")
  const uiSource = read("src/app/(dashboard)/keuangan/giro/_components/cheque-overdue-queue.tsx")
  const pageSource = read("src/app/(dashboard)/keuangan/giro/page.tsx")

  it("AC-CQ-B5/F2: builder+loader baca-saja — tanpa panggilan aksi tulis giro", () => {
    expect(builderSource + loaderSource).not.toMatch(/updateChequeStatus|deleteCheque|createCheque/)
    expect(loaderSource).not.toMatch(/\.update\(|\.create\(|\.delete\(|updateMany/)
    expect(loaderSource).toContain('requirePermission("view_cheques")')
  })

  it("BR-CQ-02: builder mengonsumsi daysUntilDue existing, bukan rumus hari kedua", () => {
    expect(builderSource).toContain('from "@/lib/reports/post-dated-cheques"')
    expect(builderSource).toMatch(/daysUntilDue\(input\.dueDate, asOf\)/)
  })

  it("AC-CQ-B4: nominal tidak dilabeli istilah saldo buku pada builder/loader/UI", () => {
    const surfaces = builderSource + loaderSource + uiSource
    expect(surfaces).not.toMatch(/saldo piutang|saldo utang|piutang usaha|utang usaha|aging/i)
    expect(builderSource).toContain("Nominal Tercatat")
  })

  it("AC-CQ-F1: UI verbatim payload — tanpa hitung umur/tingkat/urutan/rekap sendiri", () => {
    expect(uiSource).not.toMatch(/\.sort\(|daysUntilDue|getTime\(\)|86400|86_400/)
    expect(uiSource).toContain("CHEQUE_OVERDUE_QUEUE_TITLE")
    expect(uiSource).toContain("row.umurLewatLabel")
    expect(uiSource).toContain("row.tierLabel")
    expect(uiSource).toContain("queue.recap")
  })

  it("AC-CQ-F2: tanpa tombol tulis dari antrean; tautan hanya ke register giro existing", () => {
    expect(uiSource).not.toMatch(/<button|onPress=|onClick=|updateChequeStatus|deleteCheque|createCheque/)
    expect(uiSource).not.toMatch(/>\s*(Cair|Batal|Hapus)\s*</)
    expect(uiSource).toContain('href="/keuangan/giro"')
    expect(uiSource).not.toMatch(/href="\/keuangan\/(?!giro)/)
  })

  it("AC-CQ-F3: baris tertanda tampil dengan tandanya; register existing tidak berubah", () => {
    expect(uiSource).toContain("CHEQUE_UNKNOWN_STATUS_LABEL")
    expect(uiSource).toContain("CHEQUE_OVERDUE_TRUNCATED_LABEL")
    expect(uiSource).toContain('?? "—"')
    expect(pageSource).toContain("getChequeOverdueQueue")
    expect(pageSource).toContain("ChequeOverdueQueueSection")
    expect(pageSource).toContain("ChequeManager")
    expect(pageSource).toContain("take: 200")
  })
})
