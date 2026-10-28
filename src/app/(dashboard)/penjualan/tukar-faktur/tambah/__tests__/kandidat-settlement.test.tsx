// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  candidateFindMany: vi.fn(),
  exchangedFindMany: vi.fn(),
  customerFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
  hasPermission: vi.fn().mockResolvedValue(false),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customer: { findMany: mocks.customerFindMany },
    salesInvoice: { findMany: mocks.candidateFindMany },
    invoiceExchangeItem: { findMany: mocks.exchangedFindMany },
  },
}))

vi.mock("@/actions/invoice-exchange.actions", () => ({
  createInvoiceExchange: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/penjualan/tukar-faktur/tambah",
  useSearchParams: () => new URLSearchParams(),
}))

import CreateInvoiceExchangePage from "../page"

const GRAND = 1000000

function invoice(id: number, paidAmount: number) {
  return {
    id,
    documentNo: `SI-${id}`,
    date: new Date(Date.UTC(2026, 9, 1)),
    grandTotal: GRAND,
    paidAmount,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: "u1", name: "Uji", email: "uji@x.id" })
  mocks.customerFindMany.mockResolvedValue([{ id: 7, name: "Pelanggan Tujuh" }])
  mocks.exchangedFindMany.mockResolvedValue([])
})

async function candidateIds(paidAmounts: number[]) {
  mocks.candidateFindMany.mockResolvedValue(paidAmounts.map((p, i) => invoice(i + 1, p)))
  const node = await CreateInvoiceExchangePage({
    searchParams: Promise.resolve({ customer: "7" }),
  })
  const { renderToString } = await import("react-dom/server")
  return renderToString(node)
}

describe("FIN-BR-006 kandidat tukar faktur", () => {
  it("sisa Rp0,50 (dalam toleransi Rp1) tidak masuk kandidat", async () => {
    const html = await candidateIds([GRAND - 0.5])
    expect(html).not.toContain("SI-1")
  })

  it("sisa tepat Rp1,00 tidak masuk kandidat", async () => {
    const html = await candidateIds([GRAND - 1])
    expect(html).not.toContain("SI-1")
  })

  it("sisa Rp1,01 tetap kandidat", async () => {
    const html = await candidateIds([GRAND - 1.01])
    expect(html).toContain("SI-1")
  })
})
