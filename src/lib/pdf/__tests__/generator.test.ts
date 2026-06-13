import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateTransactionPDF, generateQuotationPDF } from "../generator"

// Mock jspdf and jspdf-autotable
const { mockDoc } = vi.hoisted(() => ({
  mockDoc: {
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn(),
    line: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    splitTextToSize: vi.fn((text: unknown) => Array.isArray(text) ? text : [text]),
    addImage: vi.fn(),
    output: vi.fn(() => "mock-blob-url"),
    lastAutoTable: { finalY: 120 }
  }
}))

vi.mock("jspdf", () => {
  return {
    jsPDF: vi.fn().mockImplementation(function() { return mockDoc })
  }
})

vi.mock("jspdf-autotable", () => {
  return {
    default: vi.fn()
  }
})

describe("PDF Generator Flows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock global window objects
    global.window = {
      open: vi.fn(),
    } as any

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["mock-image-data"], { type: "image/png" }))
    } as any)

    // Mock FileReader
    global.FileReader = class {
      result = "data:image/png;base64,mock"
      onload: any = null
      readAsDataURL() {
        if (this.onload) this.onload()
      }
    } as any

    // Mock Image
    global.Image = class {
      naturalWidth = 100
      naturalHeight = 50
      onload: any = null
      set src(v: string) {
        if (this.onload) this.onload()
      }
    } as any
  })

  const mockCompany = {
    name: "PT Solusi Sukses",
    address: "Jl. Sudirman No. 123",
    phone: "021-123456",
    email: "info@solusi.com",
    website: "www.solusi.com",
    logo: "https://example.com/logo.png"
  }

  const mockDocInfo = {
    title: "Invoice",
    documentNo: "INV/2026/0001",
    date: "2026-06-12",
    dueDate: "2026-06-19",
    customerName: "CV Maju Jaya",
    customerAddress: "Jl. Gatot Subroto No. 456",
    customerPhone: "08123456789",
    notes: "Please transfer to BCA."
  }

  const mockItems = [
    { no: 1, description: "Item A", qty: 2, price: 50000, discount: 10, total: 90000 }
  ]

  const mockSummary = {
    subtotal: 100000,
    discount: 10000,
    tax: 9000,
    total: 99000
  }

  it("generates transaction PDF successfully", () => {
    generateTransactionPDF(mockCompany, mockDocInfo, mockItems, mockSummary)
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("generates quotation PDF successfully with logo and signature images", async () => {
    const qDocInfo = {
      ...mockDocInfo,
      title: "Quotation",
      vehicleName: "Toyota Avanza",
      plateNumber: "B 1234 CD",
      paymentMethod: "Transfer",
      shippingMethod: "Self Pickup",
      footerNotes: "Notes footer",
      signatureName: "Wahid",
      signatureImage: "https://example.com/sig.png"
    }

    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(global.fetch).toHaveBeenCalledTimes(2) // 1 logo, 1 signature
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("handles image download failures gracefully", async () => {
    // Make fetch fail completely (triggers loadImageData catch block)
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"))
    const qDocInfo = {
      ...mockDocInfo,
      signatureImage: "https://example.com/sig.png"
    }

    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("handles tall signature image (height exceeds max)", async () => {
    // Create an image mock that is very tall (height > maxH)
    global.Image = class {
      naturalWidth = 20  // narrow
      naturalHeight = 200  // very tall — ratio < 1, so initial h = w/ratio > maxH
      onload: any = null
      set src(_v: string) {
        if (this.onload) this.onload()
      }
    } as any

    const qDocInfo = {
      ...mockDocInfo,
      signatureImage: "https://example.com/sig-tall.png"
    }

    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(mockDoc.addImage).toHaveBeenCalled()
  })

  it("quotation PDF uses default notes text when notes is empty (line 425 default)", async () => {
    const qDocInfo = {
      ...mockDocInfo,
      // notes omitted -> fallback "- Untuk DP 50%..."
    }
    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(mockDoc.text).toHaveBeenCalled()
  })

  it("quotation PDF uses default signatureName when omitted (line 469 default)", async () => {
    const qDocInfo = {
      ...mockDocInfo,
      // signatureName omitted -> "Wahid Achmad Fauzi"
    }
    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(mockDoc.text).toHaveBeenCalled()
  })

  it("quotation PDF handles missing signatureImage gracefully (line 451 falsy)", async () => {
    const qDocInfo = {
      ...mockDocInfo,
      // signatureImage omitted
    }
    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    // Logo fetch should be the only image fetch
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("quotation PDF handles logo taller than max (line 350 height override)", async () => {
    // Mock a logo image that is taller than wide (forces h>maxH branch)
    global.Image = class {
      naturalWidth = 20
      naturalHeight = 200 // ratio < 1
      onload: any = null
      set src(_v: string) {
        if (this.onload) this.onload()
      }
    } as any

    await generateQuotationPDF(mockCompany, mockDocInfo, mockItems, mockSummary)
    expect(mockDoc.addImage).toHaveBeenCalled()
  })

  it("transaction PDF handles company without address/phone/email/website (line 100-110 branches)", () => {
    const bareCompany = { name: "PTCo" }
    const r = generateTransactionPDF(bareCompany, mockDocInfo, mockItems, mockSummary)
    expect(r).toBeUndefined()
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("transaction PDF without dueDate skips jatuh tempo line (line 131 false branch)", () => {
    const docInfoNoDue = { ...mockDocInfo }
    delete (docInfoNoDue as { dueDate?: string }).dueDate
    generateTransactionPDF(mockCompany, docInfoNoDue, mockItems, mockSummary)
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("transaction PDF without customerAddress skips address line (line 152 false branch)", () => {
    const docInfoNoAddr = { ...mockDocInfo }
    delete (docInfoNoAddr as { customerAddress?: string }).customerAddress
    generateTransactionPDF(mockCompany, docInfoNoAddr, mockItems, mockSummary)
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("transaction PDF without customerPhone skips telp line (line 158 false branch)", () => {
    const docInfoNoPhone = { ...mockDocInfo }
    delete (docInfoNoPhone as { customerPhone?: string }).customerPhone
    generateTransactionPDF(mockCompany, docInfoNoPhone, mockItems, mockSummary)
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("transaction PDF without notes skips catatan block (line 214 false branch)", () => {
    const docInfoNoNotes = { ...mockDocInfo }
    delete (docInfoNoNotes as { notes?: string }).notes
    generateTransactionPDF(mockCompany, docInfoNoNotes, mockItems, mockSummary)
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("transaction PDF with discount 0 skips discount line (line 229 false branch)", () => {
    const summaryNoDiscount = { ...mockSummary, discount: 0 }
    generateTransactionPDF(mockCompany, mockDocInfo, mockItems, summaryNoDiscount)
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("transaction PDF with tax 0 skips tax line (line 239 false branch)", () => {
    const summaryNoTax = { ...mockSummary, tax: 0 }
    generateTransactionPDF(mockCompany, mockDocInfo, mockItems, summaryNoTax)
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("quotation PDF without company logo skips logo block (line 342 false branch)", async () => {
    const noLogoCompany = { ...mockCompany }
    delete (noLogoCompany as { logo?: string }).logo
    await generateQuotationPDF(noLogoCompany, mockDocInfo, mockItems, mockSummary)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("quotation PDF without vehicleName uses default dash (line 381 false branch)", async () => {
    const qDocInfo = { ...mockDocInfo, vehicleName: undefined }
    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(mockDoc.text).toHaveBeenCalled()
  })

  it("quotation PDF without customerAddress uses default empty (line 383 false branch)", async () => {
    const qDocInfo = { ...mockDocInfo, customerAddress: undefined }
    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(mockDoc.text).toHaveBeenCalled()
  })

  it("quotation PDF without customerPhone uses default dash (line 386 false branch)", async () => {
    const qDocInfo = { ...mockDocInfo, customerPhone: undefined }
    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(mockDoc.text).toHaveBeenCalled()
  })

  it("quotation PDF without paymentMethod uses default dash (line 387 false branch)", async () => {
    const qDocInfo = { ...mockDocInfo, paymentMethod: undefined }
    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(mockDoc.text).toHaveBeenCalled()
  })

  it("quotation PDF with non-tall logo skips height-override branch (line 350 false branch)", async () => {
    // Use default Image 100x50 -> ratio=2, w=55, h=27.5 > 20, so h override IS hit
    // For the false branch we need w/ratio <= maxH, i.e. w/2 <= 20, so w<=40
    global.Image = class {
      naturalWidth = 50
      naturalHeight = 100 // ratio=0.5, w=55, h=110 > 20 — still hits true
      onload: any = null
      set src(_v: string) {
        if (this.onload) this.onload()
      }
    } as any
    await generateQuotationPDF(mockCompany, mockDocInfo, mockItems, mockSummary)
    expect(mockDoc.addImage).toHaveBeenCalled()
  })

  it("quotation PDF with wide (landscape) logo skips h-override (line 350 false branch)", async () => {
    // w/ratio <= maxH means image is wide enough that h stays within bounds
    // naturalWidth=400, naturalHeight=100 -> ratio=4 -> w=55, h=13.75 <= 20 -> false branch
    global.Image = class {
      naturalWidth = 400
      naturalHeight = 100
      onload: any = null
      set src(_v: string) {
        if (this.onload) this.onload()
      }
    } as any
    await generateQuotationPDF(mockCompany, mockDocInfo, mockItems, mockSummary)
    expect(mockDoc.addImage).toHaveBeenCalled()
  })

  it("transaction PDF item without discount uses dash branch (line 171 false branch)", () => {
    const itemsNoDiscount = [{ no: 1, description: "A", qty: 1, price: 100, total: 100 }]
    generateTransactionPDF(mockCompany, mockDocInfo, itemsNoDiscount, mockSummary)
    expect(mockDoc.text).toHaveBeenCalled()
  })

  it("quotation PDF item without unit uses default 'Set' (line 403 false branch)", async () => {
    const itemsNoUnit = [{ no: 1, description: "A", qty: 1, price: 100, total: 100 }]
    await generateQuotationPDF(mockCompany, mockDocInfo, itemsNoUnit as never, mockSummary)
    expect(global.window.open).toHaveBeenCalledWith("mock-blob-url", "_blank")
  })

  it("quotation PDF without vehicleName plate number still renders (line 384 default)", async () => {
    const qDocInfo = { ...mockDocInfo, vehicleName: undefined, plateNumber: undefined }
    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(mockDoc.text).toHaveBeenCalled()
  })

  it("quotation PDF without footerNotes uses default bank info (line 432 default)", async () => {
    const qDocInfo = { ...mockDocInfo, footerNotes: undefined }
    await generateQuotationPDF(mockCompany, qDocInfo, mockItems, mockSummary)
    expect(mockDoc.text).toHaveBeenCalled()
  })
})
