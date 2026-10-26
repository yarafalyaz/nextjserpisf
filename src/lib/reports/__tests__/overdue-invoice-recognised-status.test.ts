import fs from "node:fs"
import path from "node:path"

import { describe, expect, it, vi, beforeEach } from "vitest"

import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"

/**
 * Q-SIQ-6 (vonis Accountant, kartu t_15f822cd): permukaan "faktur jatuh
 * tempo" hanya boleh menangkap piutang yang sudah diakui. Draft/approved/
 * sent belum terbit (jurnal hanya lahir di postInvoice) dengan dueDate
 * lampau dan paymentStatus null TIDAK boleh masuk; posted/partial masuk;
 * paid/cancelled keluar. Mode normal (overdueOnly=false) tidak berubah.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    salesInvoice: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn().mockResolvedValue(undefined),
}))
// Render tidak dijalankan (element JSX hanya dibangun); mock daun UI supaya
// impor page tidak menarik rantai next-auth/next/server ke vitest node.
vi.mock("@/app/(dashboard)/penjualan/faktur/_components/invoice-table", () => ({
  InvoiceTable: () => null,
}))
vi.mock("@/components/ui/breadcrumbs", () => ({ AppBreadcrumbs: () => null }))
vi.mock("@/components/auth/can-create", () => ({ CanCreate: () => null }))

import { renderInvoicesPage } from "@/app/(dashboard)/penjualan/faktur/page"

type Row = {
  status: string
  paymentStatus: string | null
  dueDate: Date
  deletedAt: Date | null
}

type Where = {
  dueDate?: { lt: Date }
  paymentStatus?: { not: string }
  status?: { in?: string[]; not?: string }
  deletedAt?: Date | null
}

/** Evaluator semantik where Prisma subset yang dipakai permukaan overdue. */
function matchesWhere(row: Row, where: Where): boolean {
  if (where.dueDate && !(row.dueDate < where.dueDate.lt)) return false
  if (where.paymentStatus && row.paymentStatus === where.paymentStatus.not) return false
  if (where.status?.in && !where.status.in.includes(row.status)) return false
  if (where.status?.not && row.status === where.status.not) return false
  if (where.deletedAt !== undefined && row.deletedAt !== where.deletedAt) return false
  return true
}

const PAST = new Date("2026-10-01T00:00:00.000Z")
function row(status: string, paymentStatus: string | null): Row {
  return { status, paymentStatus, dueDate: PAST, deletedAt: null }
}

const POPULATION: Row[] = [
  row("draft", null),
  row("approved", null),
  row("sent", "unpaid"),
  row("posted", "unpaid"),
  row("partial", "partial"),
  row("paid", "paid"),
  row("cancelled", "cancelled"),
]

async function captureOverdueWhere(): Promise<Where> {
  await renderInvoicesPage(Promise.resolve({}), true)
  const arg = mocks.prisma.salesInvoice.findMany.mock.calls.at(-1)?.[0]
  return (arg?.where ?? {}) as Where
}

describe("Q-SIQ-6 overdueOnly faktur page", () => {
  beforeEach(() => vi.clearAllMocks())

  it("where memakai daftar positif RECOGNISED_AR_STATUSES (sumber tunggal)", async () => {
    const where = await captureOverdueWhere()
    expect(where.status).toEqual({ in: [...RECOGNISED_AR_STATUSES] })
    expect(where.paymentStatus).toEqual({ not: "paid" })
    expect(where.deletedAt).toBeNull()
    expect(where.dueDate?.lt).toBeInstanceOf(Date)
  })

  it("populasi: hanya posted/partial lampau belum lunas yang masuk", async () => {
    const where = await captureOverdueWhere()
    const admitted = POPULATION.filter((r) => matchesWhere(r, where)).map((r) => r.status)
    expect(admitted).toEqual(["posted", "partial"])
  })

  it("mode normal tidak menyaring status (draft tetap tampil di daftar biasa)", async () => {
    await renderInvoicesPage(Promise.resolve({}), false)
    const arg = mocks.prisma.salesInvoice.findMany.mock.calls.at(-1)?.[0]
    expect((arg?.where as Where).status).toBeUndefined()
  })
})

describe("Q-SIQ-6 tiga permukaan sekelas memakai saring yang sama", () => {
  const surfaces = [
    "src/app/api/dashboard/notifications/route.ts",
    "src/app/api/cron/daily-notifications/route.ts",
    "src/app/api/cron/route.ts",
    "src/app/(dashboard)/penjualan/faktur/page.tsx",
  ]

  for (const rel of surfaces) {
    it(`${rel}: import sumber tunggal + status in RECOGNISED_AR_STATUSES, tanpa not-cancelled`, () => {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8")
      expect(src).toContain('from "@/lib/reports/document-status"')
      expect(src).toMatch(/status:\s*\{\s*in:\s*\[\.\.\.RECOGNISED_AR_STATUSES\]\s*\}/)
      expect(src).not.toMatch(/status:\s*\{\s*not:\s*"cancelled"/)
    })
  }
})
