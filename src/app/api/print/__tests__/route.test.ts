import { describe, it, expect, vi, beforeEach } from "vitest"

// document-scope (dipakai route cetak) memakai `import "server-only"`.
vi.mock("server-only", () => ({}))

// Route cetak menegakkan batas gudang untuk dokumen yang dibatasi. Berkas ini
// fokus pada izin + rendering PDF, jadi cakupan gudang di-stub "all"; perilaku
// batasnya diuji tersendiri di src/lib/auth/__tests__/document-scope.test.ts.
vi.mock("@/lib/auth/warehouse-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/warehouse-scope")>()
  return { ...actual, getWarehouseScope: vi.fn(async () => ({ kind: "all" })) }
})

import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  hasPermission: vi.fn(),
  getSystemSettings: vi.fn(),
  salesInvoiceFindUnique: vi.fn(),
  quotationFindUnique: vi.fn(),
  salesOrderFindUnique: vi.fn(),
  workOrderFindUnique: vi.fn(),
  purchaseOrderFindUnique: vi.fn(),
  deliveryOrderFindUnique: vi.fn(),
  downPaymentFindUnique: vi.fn(),
  salesPaymentFindUnique: vi.fn(),
  vendorPaymentFindUnique: vi.fn(),
  salesReturnFindUnique: vi.fn(),
  purchaseReturnFindUnique: vi.fn(),
  goodsReceiptFindUnique: vi.fn(),
  purchaseRequestFindUnique: vi.fn(),
  vendorBillFindUnique: vi.fn(),
  expenseFindUnique: vi.fn(),
  paymentMethodFindUnique: vi.fn(),
  shippingMethodFindUnique: vi.fn(),
  itemFindMany: vi.fn(),
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
    purchaseOrder: { findUnique: (...a: unknown[]) => mocks.purchaseOrderFindUnique(...a) },
    deliveryOrder: { findUnique: (...a: unknown[]) => mocks.deliveryOrderFindUnique(...a) },
    downPayment: { findUnique: (...a: unknown[]) => mocks.downPaymentFindUnique(...a) },
    salesPayment: { findUnique: (...a: unknown[]) => mocks.salesPaymentFindUnique(...a) },
    vendorPayment: { findUnique: (...a: unknown[]) => mocks.vendorPaymentFindUnique(...a) },
    salesReturn: { findUnique: (...a: unknown[]) => mocks.salesReturnFindUnique(...a) },
    purchaseReturn: { findUnique: (...a: unknown[]) => mocks.purchaseReturnFindUnique(...a) },
    goodsReceipt: { findUnique: (...a: unknown[]) => mocks.goodsReceiptFindUnique(...a) },
    purchaseRequest: { findUnique: (...a: unknown[]) => mocks.purchaseRequestFindUnique(...a) },
    vendorBill: { findUnique: (...a: unknown[]) => mocks.vendorBillFindUnique(...a) },
    expense: { findUnique: (...a: unknown[]) => mocks.expenseFindUnique(...a) },
    paymentMethod: { findUnique: (...a: unknown[]) => mocks.paymentMethodFindUnique(...a) },
    shippingMethod: { findUnique: (...a: unknown[]) => mocks.shippingMethodFindUnique(...a) },
    item: { findMany: (...a: unknown[]) => mocks.itemFindMany(...a) },
  },
}))

vi.spyOn(console, "error").mockImplementation(() => {})

function makeReq(url: string): Request {
  return new Request(url) as any
}

const baseSettings = {
  companyName: "PT Test",
  companyAddress: "Jl. Test 1",
  companyVillage: "Kenanga",
  companyDistrict: "Cipondoh",
  companyCity: "Kota Tangerang",
  companyProvince: "Banten",
  companyPostalCode: "15146",
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

  it("rejects fractional and unsafe ids before querying", async () => {
    for (const id of ["1.5", "9007199254740992"]) {
      const res = await GET(makeReq(`http://localhost/api/print?tipe=invoice&id=${id}`))
      expect(res.status).toBe(400)
    }
    expect(mocks.salesInvoiceFindUnique).not.toHaveBeenCalled()
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
      expect(json.docInfo.title).toBe("FAKTUR PENJUALAN")
      expect(json.items[0].description).toBe("Besi")
      expect(json.summary.total).toBe(1050)
    })

    it("kop PDF memuat wilayah lengkap (desa/kecamatan/kota/provinsi + kode pos)", async () => {
      const res = await GET(makeReq("http://localhost/api/print?tipe=invoice&id=1"))
      const json = await res.json()
      // Regresi: kop dulu hanya `companyAddress` + kode pos, sehingga baris
      // Desa/Kecamatan/Kota/Provinsi tidak pernah muncul walau sudah diisi.
      expect(json.company.address).toBe(
        "Jl. Test 1\nKenanga, Cipondoh, Kota Tangerang, Banten 15146",
      )
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
        customer: { name: "Cust", address: null, street: "St", phone: "08", email: "cust@gmail.com" },
        customerVehicle: {
          vehicle: {
            plateNumber: "B 123",
            variant: { model: { name: "Avanza", brand: { name: "Toyota" } } },
          },
        },
        sections: [{ name: "Front Section", items: [{ description: "Servis", qty: 1, unitPrice: 500, discount: 0, total: 500, uom: "Pcs" }] }],
      })
      mocks.paymentMethodFindUnique.mockResolvedValue({ name: "Transfer Bank" })
      mocks.shippingMethodFindUnique.mockResolvedValue({ name: "JNE" })

      const res = await GET(makeReq("http://localhost/api/print?tipe=quotation&id=1"))
      const json = await res.json()
      expect(json.docInfo.vehicleName).toBe("Toyota Avanza")
      expect(json.docInfo.paymentMethod).toBe("Transfer Bank")
      expect(json.docInfo.shippingMethod).toBe("JNE")
      expect(json.docInfo.customerEmail).toBe("cust@gmail.com")
      expect(json.sections).toBeDefined()
      expect(json.sections.length).toBe(1)
      expect(json.sections[0].name).toBe("Front Section")
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
      expect(json.docInfo.title).toBe("PESANAN PENJUALAN")
    })

    it("returns 404 when order not found", async () => {
      mocks.salesOrderFindUnique.mockResolvedValue(null)
      const res = await GET(makeReq("http://localhost/api/print?tipe=order&id=99"))
      expect(res.status).toBe(404)
    })
  })

  describe("work-order", () => {
    it("returns work order print data with items and status", async () => {
      mocks.workOrderFindUnique.mockResolvedValue({
        documentNo: "WO-1",
        date: new Date(),
        startDate: null,
        endDate: null,
        status: "pending",
        customer: { name: "A", address: "B", street: null, phone: "" },
        items: [{ itemId: 99, qty: 2, status: "pending", description: "Material" }],
      })
      mocks.itemFindMany.mockResolvedValue([{ id: 99, name: "Material", sku: "M-1" }])
      const res = await GET(makeReq("http://localhost/api/print?tipe=work-order&id=1"))
      const json = await res.json()
      expect(json.items[0].qty).toBe(2)
      expect(json.items[0].status).toBe("pending")
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

  describe("dokumen uang (kuitansi)", () => {
    it("uang muka: satu baris sebesar nominal, tanpa alokasi", async () => {
      mocks.downPaymentFindUnique.mockResolvedValue({
        documentNo: "DP-1",
        paymentDate: new Date("2026-10-02"),
        amount: 5_000_000,
        paymentMethod: "Transfer",
        notes: "DP 30%",
        customer: { name: "CV Maju", address: "Jl. M", street: null, phone: "081" },
      })
      const res = await GET(makeReq("http://localhost/api/print?tipe=down-payment&id=1"))
      const json = await res.json()
      expect(json.docInfo.title).toBe("KUITANSI UANG MUKA")
      expect(json.items).toHaveLength(1)
      expect(json.summary.total).toBe(5_000_000)
    })

    it("pembayaran penjualan: pelanggan diambil dari faktur (model tak punya relasi customer)", async () => {
      mocks.salesPaymentFindUnique.mockResolvedValue({
        documentNo: "PAY-1",
        paymentDate: new Date("2026-10-03"),
        amount: 1_500_000,
        referenceNo: "TRF-9",
        notes: null,
        salesInvoice: {
          documentNo: "INV-1",
          grandTotal: 4_000_000,
          customer: { name: "CV Pelanggan", address: "Jl. P", street: null, phone: "082" },
        },
      })
      const res = await GET(makeReq("http://localhost/api/print?tipe=sales-payment&id=1"))
      const json = await res.json()
      expect(json.docInfo.customerName).toBe("CV Pelanggan")
      expect(json.items[0].description).toContain("INV-1")
      expect(json.docInfo.notes).toContain("TRF-9")
    })

    it("pembayaran vendor: rincian per tagihan saat ada alokasi", async () => {
      mocks.vendorPaymentFindUnique.mockResolvedValue({
        documentNo: "VP-1",
        paymentDate: new Date("2026-10-04"),
        amount: 3_000_000,
        paymentMethod: "Transfer",
        notes: null,
        vendor: { name: "PT Vendor", address: "Jl. V", street: null, phone: "083" },
        allocations: [
          { amount: 2_000_000, vendorBill: { documentNo: "BILL-1" } },
          { amount: 1_000_000, vendorBill: { documentNo: "BILL-2" } },
        ],
      })
      const res = await GET(makeReq("http://localhost/api/print?tipe=vendor-payment&id=1"))
      const json = await res.json()
      expect(json.items).toHaveLength(2)
      expect(json.items[0].description).toContain("BILL-1")
      expect(json.summary.total).toBe(3_000_000)
    })
  })

  describe("retur & penerimaan", () => {
    it("retur penjualan: total dihitung qty × harga", async () => {
      mocks.salesReturnFindUnique.mockResolvedValue({
        documentNo: "SR-1",
        date: new Date("2026-10-07"),
        reason: "Barang rusak",
        customer: { name: "CV X", address: "Jl. X", street: null, phone: "" },
        salesInvoice: { documentNo: "INV-9" },
        items: [{ itemId: 3, qty: 2, price: 100_000, cost: 60_000 }],
      })
      mocks.itemFindMany.mockResolvedValue([{ id: 3, name: "Bracket", unitOfMeasure: "Pcs" }])

      const res = await GET(makeReq("http://localhost/api/print?tipe=sales-return&id=1"))
      const json = await res.json()
      expect(json.items[0]).toMatchObject({ description: "Bracket", unit: "Pcs", total: 200_000 })
      expect(json.summary.total).toBe(200_000)
      expect(json.docInfo.notes).toContain("INV-9")
    })

    it("penerimaan barang: nilai = qty × unit cost, vendor dari pesanan", async () => {
      mocks.goodsReceiptFindUnique.mockResolvedValue({
        documentNo: "GR-1",
        date: new Date("2026-10-08"),
        notes: null,
        purchaseOrder: {
          documentNo: "PO-7",
          vendor: { name: "PT Vendor", address: "Jl. V", street: null, phone: "084" },
        },
        warehouse: { name: "Gudang Utama" },
        // Skalar ini yang dibaca penjaga batas gudang (document-scope);
        // record nyata selalu punya, mock-nya saja yang tadinya belum lengkap.
        warehouseId: 1,
        items: [{ itemId: 5, qty: 4, unitCost: 25_000 }],
      })
      mocks.itemFindMany.mockResolvedValue([{ id: 5, name: "Pelat", unitOfMeasure: "Lembar" }])

      const res = await GET(makeReq("http://localhost/api/print?tipe=goods-receipt&id=1"))
      const json = await res.json()
      expect(json.items[0]).toMatchObject({ description: "Pelat", total: 100_000 })
      expect(json.summary.total).toBe(100_000)
      expect(json.docInfo.notes).toContain("Gudang Utama")
    })

    it("permintaan pembelian: tanpa harga", async () => {
      mocks.purchaseRequestFindUnique.mockResolvedValue({
        documentNo: "PR-1",
        date: new Date("2026-10-09"),
        requestDate: null,
        title: "Kebutuhan produksi",
        notes: null,
        vendor: null,
        items: [{ itemId: 9, qty: 6, notes: "Segera" }],
      })
      mocks.itemFindMany.mockResolvedValue([{ id: 9, name: "Baut", unitOfMeasure: "Pcs" }])

      const res = await GET(makeReq("http://localhost/api/print?tipe=purchase-request&id=1"))
      const json = await res.json()
      expect(json.items[0]).toMatchObject({ description: "Baut", note: "Segera", price: 0, total: 0 })
      expect(json.docInfo.customerName).toBe("Belum ditentukan")
    })

    it("tagihan vendor: total yang dibayarkan dikurangi PPh dipotong", async () => {
      mocks.vendorBillFindUnique.mockResolvedValue({
        documentNo: "BILL-9",
        date: new Date("2026-10-10"),
        dueDate: new Date("2026-11-10"),
        vendorInvoiceNumber: "VINV-1",
        subtotal: 1_000_000,
        discountAmount: 0,
        tax: 0,
        grandTotal: 1_000_000,
        withholdingAmount: 20_000,
        notes: null,
        vendor: { name: "PT Vendor", address: "Jl. V", street: null, phone: "085" },
        withholdingType: { name: "PPh 23", rate: 2 },
        items: [{ itemId: 4, description: "Jasa", qty: 1, unitPrice: 1_000_000, discountPercent: 0, total: 1_000_000 }],
      })
      mocks.itemFindMany.mockResolvedValue([])

      const res = await GET(makeReq("http://localhost/api/print?tipe=vendor-bill&id=1"))
      const json = await res.json()
      expect(json.summary.total).toBe(980_000)
      expect(json.docInfo.notes).toContain("PPh 23")
    })

    it("bukti pengeluaran: satu nominal + kategori di keterangan", async () => {
      mocks.expenseFindUnique.mockResolvedValue({
        documentNo: "EXP-1",
        date: new Date("2026-10-11"),
        amount: 250_000,
        referenceNo: "KW-7",
        description: "Beli air minum kantor",
        vendor: { name: "Toko Sembako", address: "Jl. T", street: null, phone: "086" },
        category: { label: "Konsumsi Kantor" },
      })
      const res = await GET(makeReq("http://localhost/api/print?tipe=expense&id=1"))
      const json = await res.json()
      expect(json.docInfo.title).toBe("BUKTI PENGELUARAN")
      expect(json.docInfo.customerName).toBe("Toko Sembako")
      expect(json.summary.total).toBe(250_000)
      expect(json.docInfo.notes).toContain("Konsumsi Kantor")
      expect(json.docInfo.notes).toContain("KW-7")
    })

    it("bukti pengeluaran tanpa vendor terbaca 'Biaya internal'", async () => {
      mocks.expenseFindUnique.mockResolvedValue({
        documentNo: "EXP-2",
        date: new Date(),
        amount: 50_000,
        referenceNo: null,
        description: null,
        vendor: null,
        category: { label: "Lain-lain" },
      })
      const res = await GET(makeReq("http://localhost/api/print?tipe=expense&id=2"))
      const json = await res.json()
      expect(json.docInfo.customerName).toBe("Biaya internal")
      expect(json.items[0].description).toBe("Lain-lain")
    })
  })

  describe("purchase-order", () => {
    it("memakai vendor sebagai pihak tujuan dan unit dari master barang", async () => {
      mocks.purchaseOrderFindUnique.mockResolvedValue({
        documentNo: "PO-1",
        date: new Date("2026-10-01"),
        expectedDate: new Date("2026-10-10"),
        subtotal: 2000,
        discount: 100,
        tax: 0,
        grandTotal: 1900,
        notes: "Kirim pagi",
        vendor: { name: "PT Vendor", address: "Jl. V", street: null, phone: "081" },
        items: [{ itemId: 7, qty: 2, unitPrice: 1000, discount: 50, total: 1950 }],
      })
      mocks.itemFindMany.mockResolvedValue([{ id: 7, name: "Baut M8", unitOfMeasure: "Pcs" }])

      const res = await GET(makeReq("http://localhost/api/print?tipe=purchase-order&id=1"))
      const json = await res.json()
      expect(json.docInfo.title).toBe("PESANAN PEMBELIAN")
      expect(json.docInfo.customerName).toBe("PT Vendor")
      expect(json.items[0]).toMatchObject({ description: "Baut M8", unit: "Pcs", qty: 2 })
      expect(json.summary.total).toBe(1900)
    })

    it("returns 404 when purchase order not found", async () => {
      mocks.purchaseOrderFindUnique.mockResolvedValue(null)
      const res = await GET(makeReq("http://localhost/api/print?tipe=purchase-order&id=99"))
      expect(res.status).toBe(404)
    })
  })

  describe("delivery-order", () => {
    it("mengambil pelanggan dari pesanan penjualan dan tanpa harga", async () => {
      mocks.deliveryOrderFindUnique.mockResolvedValue({
        documentNo: "SJ-1",
        date: new Date("2026-10-05"),
        deliveryDate: new Date("2026-10-06"),
        shippingAddress: "Gudang Bandung",
        notes: "Titip tetangga",
        salesOrder: { customer: { name: "CV Pembeli", address: "Jl. P", street: null, phone: "0899" } },
        items: [{ qty: 3, unit: "Box", notes: "Fragile", item: { name: "Panel", unitOfMeasure: "Pcs" } }],
      })

      const res = await GET(makeReq("http://localhost/api/print?tipe=delivery-order&id=1"))
      const json = await res.json()
      expect(json.docInfo.title).toBe("SURAT JALAN")
      expect(json.docInfo.customerName).toBe("CV Pembeli")
      expect(json.docInfo.customerAddress).toBe("Gudang Bandung")
      expect(json.items[0]).toMatchObject({ description: "Panel", qty: 3, unit: "Box", note: "Fragile", price: 0 })
      expect(json.summary.total).toBe(0)
    })

    it("memakai satuan master barang bila item tidak punya unit", async () => {
      mocks.deliveryOrderFindUnique.mockResolvedValue({
        documentNo: "SJ-2",
        date: new Date(),
        deliveryDate: null,
        shippingAddress: null,
        notes: null,
        salesOrder: { customer: { name: "X", address: "Jl X", street: null, phone: "" } },
        items: [{ qty: 1, unit: null, notes: null, item: { name: "Bracket", unitOfMeasure: "Pcs" } }],
      })
      const res = await GET(makeReq("http://localhost/api/print?tipe=delivery-order&id=2"))
      const json = await res.json()
      expect(json.items[0].unit).toBe("Pcs")
      expect(json.docInfo.customerAddress).toBe("Jl X")
    })

    it("returns 404 when delivery order not found", async () => {
      mocks.deliveryOrderFindUnique.mockResolvedValue(null)
      const res = await GET(makeReq("http://localhost/api/print?tipe=delivery-order&id=99"))
      expect(res.status).toBe(404)
    })
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
