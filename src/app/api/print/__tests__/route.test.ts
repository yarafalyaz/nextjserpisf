import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  hasPermission: vi.fn(),
  getSystemSettings: vi.fn(),
  salesInvoiceFindUnique: vi.fn(),
  quotationFindUnique: vi.fn(),
  salesOrderFindUnique: vi.fn(),
  workOrderFindUnique: vi.fn(),
  paymentMethodFindUnique: vi.fn(),
  shippingMethodFindUnique: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => mocks.authFn(...a),
}))

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => mocks.hasPermission(...a),
}))

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: (...a: unknown[]) => mocks.getSystemSettings(...a),
}))

vi.mock("@/lib/utils/method-labels", () => ({
  paymentMethodLabel: (code: string) => `label-${code}`,
  shippingMethodLabel: (code: string) => `label-${code}`,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesInvoice: { findUnique: (...a: unknown[]) => mocks.salesInvoiceFindUnique(...a) },
    quotation: { findUnique: (...a: unknown[]) => mocks.quotationFindUnique(...a) },
    salesOrder: { findUnique: (...a: unknown[]) => mocks.salesOrderFindUnique(...a) },
    workOrder: { findUnique: (...a: unknown[]) => mocks.workOrderFindUnique(...a) },
    paymentMethod: { findUnique: (...a: unknown[]) => mocks.paymentMethodFindUnique(...a) },
    shippingMethod: { findUnique: (...a: unknown[]) => mocks.shippingMethodFindUnique(...a) },
  },
}))

vi.spyOn(console, "error").mockImplementation(() => {})

function makeReq(url: string): Request {
  return new Request(url) as any
}

const baseSettings = {
  companyName: "PT Test",
  companyAddress: "Jl. Test 1",
  companyPhone: "08123",
  companyEmail: "a@b.com",
  companyWebsite: "https://test",
  companyLogo: "logo.png",
  quotationFooterNotes: "Footer",
  quotationSignatureName: "Boss",
  quotationSignatureImage: "sig.png",
}

describe("GET /api/print", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authFn.mockResolvedValue({ user: { id: 1 } })
    mocks.hasPermission.mockResolvedValue(true)
    mocks.getSystemSettings.mockResolvedValue(baseSettings)
  })

  it("returns 401 when no session", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET(makeReq("http://localhost/api/print?tipe=invoice&id=1"))
    expect(res.status).toBe(401)
  })

  it("returns 400 when type or id missing", async () => {
    const r1 = await GET(makeReq("http://localhost/api/print"))
    expect(r1.status).toBe(400)
    const r2 = await GET(makeReq("http://localhost/api/print?tipe=invoice"))
    expect(r2.status).toBe(400)
  })

  it("returns 403 when user lacks view_sales_invoices", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    const res = await GET(makeReq("http://localhost/api/print?tipe=invoice&id=1"))
    expect(res.status).toBe(403)
  })

  it("returns 400 when id is NaN", async () => {
    const res = await GET(makeReq("http://localhost/api/print?tipe=invoice&id=abc"))
    expect(res.status).toBe(400)
  })

  describe("invoice", () => {
    it("returns invoice print data with items and summary", async () => {
      mocks.salesInvoiceFindUnique.mockResolvedValue({
        documentNo: "INV-1",
        date: new Date("2026-01-15"),
        dueDate: new Date("2026-02-15"),
        subtotal: 1000,
        discount: 50,
        taxAmount: 100,
        grandTotal: 1050,
        notes: "Catatan",
        customer: { name: "PT A", address: "Jl. A", street: null, phone: "081" },
        items: [
          { description: "Besi", qty: 2, unitPrice: 500, discount: 0, total: 1000 },
        ],
      })

      const res = await GET(makeReq("http://localhost/api/print?tipe=invoice&id=1"))
      const json = await res.json()
      expect(json.docInfo.documentNo).toBe("INV-1")
      expect(json.docInfo.title).toBe("FAKTUR PENJUALAN / INVOICE")
      expect(json.items[0].description).toBe("Besi")
      expect(json.summary.total).toBe(1050)
    })

    it("returns 404 when invoice not found", async () => {
      mocks.salesInvoiceFindUnique.mockResolvedValue(null)
      const res = await GET(makeReq("http://localhost/api/print?tipe=invoice&id=99"))
      expect(res.status).toBe(404)
    })

    it("uses street when address is null", async () => {
      mocks.salesInvoiceFindUnique.mockResolvedValue({
        documentNo: "INV-1", date: new Date(), dueDate: null,
        subtotal: 0, grandTotal: 0, customer: { name: "X", address: null, street: "Jl B", phone: null },
        items: [],
      })
      const res = await GET(makeReq("http://localhost/api/print?tipe=invoice&id=1"))
      const json = await res.json()
      expect(json.docInfo.customerAddress).toBe("Jl B")
    })
  })

  describe("quotation", () => {
    it("returns quotation with vehicle info and method labels", async () => {
      mocks.quotationFindUnique.mockResolvedValue({
        documentNo: "Q-1",
        date: new Date(),
        validUntil: new Date(),
        paymentMethod: "transfer",
        shippingMethod: "courier",
        subtotal: 500,
        discount: 0,
        tax: 50,
        grandTotal: 550,
        notes: "n",
        customer: { name: "Cust", address: null, street: "St", phone: "08" },
        customerVehicle: {
          licensePlate: "B 123",
          vehicle: {
            plateNumber: "X",
            variant: { model: { name: "Avanza", brand: { name: "Toyota" } } },
          },
        },
        sections: [{ items: [{ description: "Servis", qty: 1, unitPrice: 500, discount: 0, total: 500, uom: "Pcs" }] }],
      })
      mocks.paymentMethodFindUnique.mockResolvedValue({ name: "Transfer Bank" })
      mocks.shippingMethodFindUnique.mockResolvedValue({ name: "JNE" })

      const res = await GET(makeReq("http://localhost/api/print?tipe=quotation&id=1"))
      const json = await res.json()
      expect(json.docInfo.vehicleName).toBe("Toyota Avanza")
      expect(json.docInfo.paymentMethod).toBe("Transfer Bank")
      expect(json.docInfo.shippingMethod).toBe("JNE")
    })

    it("falls back to static label when payment method row missing", async () => {
      mocks.quotationFindUnique.mockResolvedValue({
        documentNo: "Q-1", date: new Date(), validUntil: null,
        paymentMethod: "cash", shippingMethod: null,
        subtotal: 0, discount: 0, tax: 0, grandTotal: 0,
        customer: { name: "X", address: "a", street: null, phone: "" },
        customerVehicle: null, sections: [],
      })
      mocks.paymentMethodFindUnique.mockResolvedValue(null)

      const res = await GET(makeReq("http://localhost/api/print?tipe=quotation&id=1"))
      const json = await res.json()
      expect(json.docInfo.paymentMethod).toBe("label-cash")
    })

    it("returns 404 when quotation not found", async () => {
      mocks.quotationFindUnique.mockResolvedValue(null)
      const res = await GET(makeReq("http://localhost/api/print?tipe=quotation&id=99"))
      expect(res.status).toBe(404)
    })
  })

  describe("order", () => {
    it("returns sales order print data", async () => {
      mocks.salesOrderFindUnique.mockResolvedValue({
        documentNo: "SO-1", date: new Date(), deliveryDate: new Date(),
        subtotal: 100, discount: 0, tax: 10, grandTotal: 110,
        customer: { name: "A", address: "B", street: null, phone: "" },
        items: [{ description: "X", qty: 1, unitPrice: 100, discount: 0, total: 100 }],
      })
      const res = await GET(makeReq("http://localhost/api/print?tipe=order&id=1"))
      const json = await res.json()
      expect(json.docInfo.title).toBe("PESANAN PENJUALAN / SALES ORDER")
    })

    it("returns 404 when order not found", async () => {
      mocks.salesOrderFindUnique.mockResolvedValue(null)
      const res = await GET(makeReq("http://localhost/api/print?tipe=order&id=99"))
      expect(res.status).toBe(404)
    })
  })

  describe("work-order", () => {
    it("returns work order print data with computed cost", async () => {
      mocks.workOrderFindUnique.mockResolvedValue({
        documentNo: "WO-1", date: new Date(), endDate: null,
        customer: { name: "A", address: "B", street: null, phone: "" },
        items: [{ itemId: 99, qty: 2, cost: 50, description: "Material" }],
      })
      const res = await GET(makeReq("http://localhost/api/print?tipe=work-order&id=1"))
      const json = await res.json()
      expect(json.items[0].total).toBe(100)
      expect(json.summary.total).toBe(100)
    })

    it("returns 404 when work order not found", async () => {
      mocks.workOrderFindUnique.mockResolvedValue(null)
      const res = await GET(makeReq("http://localhost/api/print?tipe=work-order&id=99"))
      expect(res.status).toBe(404)
    })
  })

  it("returns 400 for unsupported type", async () => {
    const res = await GET(makeReq("http://localhost/api/print?tipe=random&id=1"))
    expect(res.status).toBe(400)
  })

  it("returns 500 on internal error", async () => {
    mocks.salesInvoiceFindUnique.mockRejectedValue(new Error("boom"))
    const res = await GET(makeReq("http://localhost/api/print?tipe=invoice&id=1"))
    expect(res.status).toBe(500)
  })

  it("uses default company name when settings empty", async () => {
    mocks.getSystemSettings.mockResolvedValue({})
    mocks.salesInvoiceFindUnique.mockResolvedValue({
      documentNo: "INV-1", date: new Date(), dueDate: null,
      subtotal: 0, grandTotal: 0, customer: { name: "X", address: null, street: null, phone: null },
      items: [],
    })
    const res = await GET(makeReq("http://localhost/api/print?tipe=invoice&id=1"))
    const json = await res.json()
    expect(json.company.name).toBe("Yara ERP")
  })
})
