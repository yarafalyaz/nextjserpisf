// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const NPWP16 = "0123456789123456"
const NITKU_LINKED = `${NPWP16}000000`

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  customerFindFirst: vi.fn(),
  customerFindUnique: vi.fn(),
  taxInvoiceFindMany: vi.fn(),
  loadCustomerTaxCompleteness: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
  hasPermission: () => false,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customer: { findFirst: mocks.customerFindFirst, findUnique: mocks.customerFindUnique },
    taxInvoice: { findMany: mocks.taxInvoiceFindMany },
  },
}))

vi.mock("@/lib/reports/customer-tax-identity-data", () => ({
  loadCustomerTaxCompleteness: mocks.loadCustomerTaxCompleteness,
}))

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound") } }))

import CustomerDetailPage from "../page"
import { Suspense, act } from "react"
import { createRoot } from "react-dom/client"
import { unmountCard } from "@/components/reports/__tests__/card-test-utils"

const CUSTOMER = {
  id: 7,
  slug: "pt-contoh",
  name: "PT Contoh",
  email: null,
  phone: null,
  city: null,
  contactPerson: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  address: null,
  taxpayerName: "PT Contoh",
  taxId: NPWP16,
  nitku: NITKU_LINKED,
  pkpStatus: "pkp",
  pkpEffectiveFrom: null,
  pkpSource: null,
  taxAddress: null,
  quotations: [],
  salesInvoices: [],
  salesOrders: [],
  projects: [],
  customerVehicles: [],
}

function invoice(over: Record<string, unknown>) {
  return {
    id: 1,
    taxInvoiceNumber: "030.000-26.00000001",
    taxInvoiceDate: new Date("2026-10-26T00:00:00Z"),
    counterpartyName: "PT Contoh",
    counterpartyTaxId: NPWP16,
    counterpartyNitku: NITKU_LINKED,
    ...over,
  }
}

describe("Detail pelanggan — penanda nitkuUnlinked snapshot (konsumen PR #998)", () => {
  let root: ReturnType<typeof createRoot> | null = null

  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.customerFindFirst.mockResolvedValue(CUSTOMER)
    mocks.loadCustomerTaxCompleteness.mockResolvedValue([
      { completeness: { ready: true, missing: [], usesTradeNameFallback: false, npwpFormat: "canonical16", nitkuLink: "linked" } },
    ])
  })

  afterEach(() => {
    if (root) unmountCard(root)
    root = null
    document.body.replaceChildren()
    vi.clearAllMocks()
  })

  // Halaman memuat Link next/link (useRouter lazy) → bungkus Suspense +
  // act async agar render tuntas di jsdom (renderPageNode sinkron suspend).
  async function render() {
    const node = await CustomerDetailPage({ params: Promise.resolve({ slug: "pt-contoh" }) })
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(<Suspense fallback={null}>{node}</Suspense>)
    })
    // Tab Identitas Pajak bukan tab default — isi tetap ter-render di DOM.
    const trigger = [...container.querySelectorAll("button")].find((b) => b.textContent === "Identitas Pajak")
    if (trigger) { await act(async () => { trigger.focus() }); await act(async () => { trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })) }) }
    return container
  }

  it("NITKU sah + NPWP snapshot 15 digit → tertanda belum tertaut, nilai NITKU verbatim", async () => {
    mocks.taxInvoiceFindMany.mockResolvedValue([
      invoice({ counterpartyTaxId: "123456789012345", counterpartyNitku: "9999999999999999000001" }),
    ])
    const container = await render()
    expect(container.textContent).toContain("9999999999999999000001 (belum tertaut — NPWP snapshot bukan 16 digit)")
    expect(container.textContent).not.toContain("terbit bertanda nitkuAbsent")
  })

  it("NITKU tertaut NPWP 16 → nilai verbatim tanpa penanda; NITKU kosong → penanda nitkuAbsent", async () => {
    mocks.taxInvoiceFindMany.mockResolvedValue([
      invoice({}),
      invoice({ id: 2, taxInvoiceNumber: "030.000-26.00000002", counterpartyNitku: null }),
    ])
    const container = await render()
    expect(container.textContent).toContain(NITKU_LINKED)
    expect(container.textContent).not.toContain("belum tertaut")
    expect(container.textContent).toContain("(kosong — terbit bertanda nitkuAbsent)")
  })
})
