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
})
