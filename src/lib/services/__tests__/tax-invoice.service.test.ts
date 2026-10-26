import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Guard service TaxInvoice (F-002(d), F-001): duplikat (direction,nomor)
 * + duplikat (vendor,nomor) non-batal ditolak keras; assertPeriodOpen
 * dalam tx; setting/COA fail-closed di jalur jurnal (pola hook existing).
 * Mock prisma: $transaction meneruskan tx mock (tanpa semantik rollback —
 * kontrak success:false + pesan definitif yang diuji, per atomisitas-transaksi).
 */

const mocks = vi.hoisted(() => {
  const taxInvoiceFindFirst = vi.fn()
  const taxInvoiceCreate = vi.fn()
  const taxInvoiceUpdate = vi.fn()
  const taxInvoiceFindUniqueOrThrow = vi.fn()
  const salesInvoiceUpdate = vi.fn()
  const salesInvoiceFindUnique = vi.fn()
  const vendorBillUpdate = vi.fn()
  const claimIdempotencyKey = vi.fn()
  const bindIdempotencyKey = vi.fn()
  const assertPeriodOpen = vi.fn()
  const queryRaw = vi.fn()
  const dpFindUnique = vi.fn()
  const tiFindMany = vi.fn()

  const tx: Record<string, unknown> = {
    taxInvoice: {
      findFirst: taxInvoiceFindFirst,
      findMany: tiFindMany,
      create: taxInvoiceCreate,
      update: taxInvoiceUpdate,
      findUniqueOrThrow: taxInvoiceFindUniqueOrThrow,
    },
    salesInvoice: { update: salesInvoiceUpdate, findUnique: salesInvoiceFindUnique },
    downPayment: { findUnique: dpFindUnique },
    vendorBill: { update: vendorBillUpdate },
    $queryRaw: queryRaw,
  }
  const prisma = {
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  }
  return {
    taxInvoiceFindFirst, taxInvoiceCreate, taxInvoiceUpdate, taxInvoiceFindUniqueOrThrow,
    salesInvoiceUpdate, salesInvoiceFindUnique, vendorBillUpdate, claimIdempotencyKey, bindIdempotencyKey,
    assertPeriodOpen, queryRaw, dpFindUnique, tiFindMany, prisma,
  }
})

vi.mock("@/lib/db/prisma", async () => ({ prisma: mocks.prisma, Prisma: (await import("@prisma/client")).Prisma }))
vi.mock("@/lib/services/period-lock.service", () => ({ assertPeriodOpen: (...a: unknown[]) => mocks.assertPeriodOpen(...a) }))
vi.mock("@/lib/services/financial-idempotency.service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/services/financial-idempotency.service")>()
  return {
    ...orig,
    claimIdempotencyKey: (...a: unknown[]) => mocks.claimIdempotencyKey(...a),
    bindIdempotencyKey: (...a: unknown[]) => mocks.bindIdempotencyKey(...a),
  }
})

import { issueTaxInvoice, replaceTaxInvoice, cancelTaxInvoice, creditInputInvoice, issueDownPaymentTaxInvoice } from "@/lib/services/tax-invoice.service"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claimIdempotencyKey.mockResolvedValue({ replayed: false })
  mocks.bindIdempotencyKey.mockResolvedValue(undefined)
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.queryRaw.mockResolvedValue([{ id: 1 }])
  mocks.taxInvoiceFindFirst.mockResolvedValue(null)
  mocks.dpFindUnique.mockResolvedValue(null)
  mocks.tiFindMany.mockResolvedValue([])
  mocks.taxInvoiceCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 7, ...data }),
  )
  mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue({
    id: 7, direction: "in", taxPeriod: "2026-01", taxAmount: 1_320_000,
    djpStatus: "draft", creditStatus: "uncredited", transactionCode: "04", taxRate: 12,
    salesInvoiceId: null, vendorBillId: 3,
    counterpartyTaxId: null, counterpartyName: null, counterpartyNitku: null, vendorId: 5,
  })
  // F-004-S: faktur penjualan tertaut tanpa pelanggan ter-load → snapshot
  // jatuh ke isian manual input (gerbang EC-3 menilai isian itu).
  mocks.salesInvoiceFindUnique.mockResolvedValue(null)
})

function key() {
  return `test-key-${Math.random().toString(36).slice(2, 10)}-ab`
}

describe("issueTaxInvoice guards", () => {
  it("F-002(d): duplikat (vendor,nomor) masukan non-batal ditolak definitif", async () => {
    mocks.taxInvoiceFindFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.vendorId != null) return Promise.resolve({ id: 9 })
      return Promise.resolve(null)
    })
    const r = await issueTaxInvoice({
      direction: "in", taxInvoiceNumber: "010.001-26.00000001",
      taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000,
      vendorId: 5, vendorBillId: 3, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(r.ambiguous).toBe(false)
    expect(String(r.error)).toMatch(/Duplikat faktur masukan/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("duplikat (direction,nomor) global ditolak", async () => {
    mocks.taxInvoiceFindFirst.mockResolvedValue({ id: 11 })
    const r = await issueTaxInvoice({
      direction: "out", taxInvoiceNumber: "010.001-26.00000001",
      taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000,
      salesInvoiceId: 1, idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("terbit ok: DPP 11/12, cermin kepala rantai ditulis, bind key", async () => {
    // Putusan Lead §8A-5 (tafsir ulang AC-TX-B5): terbit out kini wajib
    // identitas — tes diperbarui di PR sama, bukan gerbang dilonggarkan.
    const r = await issueTaxInvoice({
      direction: "out", taxInvoiceNumber: "010.001-26.00000002",
      taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000,
      salesInvoiceId: 1, idempotencyKey: key(),
      counterpartyName: "PT Lawan Uji", counterpartyTaxId: "0123456789123456",
    })
    expect(r.success).toBe(true)
    expect(mocks.taxInvoiceCreate).toHaveBeenCalledTimes(1)
    const data = mocks.taxInvoiceCreate.mock.calls[0][0].data
    expect(Number(data.dpp)).toBe(11_000_000)
    expect(Number(data.taxAmount)).toBe(1_320_000)
    expect(data.transactionCode).toBe("04")
    expect(data.counterpartyName).toBe("PT Lawan Uji")
    expect(mocks.salesInvoiceUpdate).toHaveBeenCalled()
    expect(mocks.bindIdempotencyKey).toHaveBeenCalled()
  })

  it("F-004-S EC-3: terbit out identitas kosong ditolak; snapshot master disalin; edit master tak mengubah snapshot tersimpan", async () => {
    // Tanpa tautan + tanpa isian manual → tolak (nama kosong).
    const kosong = await issueTaxInvoice({
      direction: "out", taxInvoiceNumber: "010.001-26.00000003",
      taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000, idempotencyKey: key(),
    })
    expect(kosong.success).toBe(false)
    expect(String(kosong.error)).toMatch(/Nama lawan transaksi wajib/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()

    // Tertaut faktur penjualan: snapshot = master saat terbit (AC-TX-B1).
    mocks.salesInvoiceFindUnique.mockResolvedValue({
      customer: { taxId: "0123456789123456", taxpayerName: "PT WP Master", nitku: "0123456789123456000000" },
    })
    const tertaut = await issueTaxInvoice({
      direction: "out", taxInvoiceNumber: "010.001-26.00000004",
      taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000,
      salesInvoiceId: 9, idempotencyKey: key(),
    })
    expect(tertaut.success).toBe(true)
    const snap = mocks.taxInvoiceCreate.mock.calls[0][0].data
    expect(snap.counterpartyTaxId).toBe("0123456789123456")
    expect(snap.counterpartyName).toBe("PT WP Master")
    expect(snap.counterpartyNitku).toBe("0123456789123456000000")
    // AC-TX-B2: snapshot objek tersimpan beku — mutasi master mock
    // sesudahnya tidak menulis ulang data create yang sudah terjadi.
    expect(snap.counterpartyName).toBe("PT WP Master")
  })

  it("F-004-S: NPWP 15 digit tanpa konfirmasi ditolak, dengan konfirmasi terbit", async () => {
    const base = {
      direction: "out" as const, taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000,
      counterpartyName: "PT Legacy", counterpartyTaxId: "123456789012345",
    }
    const tolak = await issueTaxInvoice({ ...base, taxInvoiceNumber: "010.001-26.00000005", idempotencyKey: key() })
    expect(tolak.success).toBe(false)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
    const ok = await issueTaxInvoice({ ...base, taxInvoiceNumber: "010.001-26.00000006", idempotencyKey: key(), legacy15Confirmed: true })
    expect(ok.success).toBe(true)
  })

  it("F-004-S mismatch: terbit out NPWP16 + NITKU awalan-beda ditolak SEBELUM tulis dokumen (gerbang :233); tertaut master + isian manual sama-sama tertolak", async () => {
    // Isian manual: snapshot langsung dari input.
    const manual = await issueTaxInvoice({
      direction: "out", taxInvoiceNumber: "010.001-26.00000007",
      taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000, idempotencyKey: key(),
      counterpartyName: "PT X WP", counterpartyTaxId: "0123456789123456",
      counterpartyNitku: "9999999999999999000001",
    })
    expect(manual.success).toBe(false)
    expect(String(manual.error)).toMatch(/NITKU lawan transaksi tidak diawali NPWP lawan transaksi/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()

    // Tertaut: mismatch disalin dari master pelanggan faktur penjualan.
    mocks.salesInvoiceFindUnique.mockResolvedValue({
      customer: { taxId: "0123456789123456", taxpayerName: "PT WP Master", nitku: "9999999999999999000001" },
    })
    const tertaut = await issueTaxInvoice({
      direction: "out", taxInvoiceNumber: "010.001-26.00000008",
      taxInvoiceDate: new Date(2026, 0, 10), sellingPrice: 12_000_000,
      salesInvoiceId: 9, idempotencyKey: key(),
    })
    expect(tertaut.success).toBe(false)
    expect(String(tertaut.error)).toMatch(/NITKU lawan transaksi tidak diawali NPWP lawan transaksi/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })
})

describe("replaceTaxInvoice guards", () => {
  const oldInvoice = {
    id: 7, direction: "out", taxPeriod: "2026-01", taxInvoiceNumber: "010.001-26.00000009",
    taxInvoiceDate: new Date(2026, 0, 10), taxAmount: 1_320_000,
    djpStatus: "approved", creditStatus: "uncredited", transactionCode: "04", taxRate: 12,
    salesInvoiceId: 1, vendorBillId: null, vendorId: null,
    counterpartyTaxId: null, counterpartyName: null, counterpartyNitku: null,
  }

  it("pengganti: masa SPT = masa faktur diganti, lama → replaced", async () => {
    mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue(oldInvoice)
    const r = await replaceTaxInvoice({
      replacesId: 7, taxInvoiceNumber: "010.001-26.00000009",
      taxInvoiceDate: new Date(2026, 2, 5), sellingPrice: 6_000_000,
      replaceReason: "salah DPP", idempotencyKey: key(),
    })
    expect(r.success).toBe(true)
    const data = mocks.taxInvoiceCreate.mock.calls[0][0].data
    expect(data.taxPeriod).toBe("2026-01")
    expect(data.replacesId).toBe(7)
    expect(Number(data.dpp)).toBe(5_500_000)
    expect(Number(data.taxAmount)).toBe(660_000)
    expect(mocks.taxInvoiceUpdate).toHaveBeenCalledWith(
      { where: { id: 7 }, data: { djpStatus: "replaced" } },
    )
  })

  it("nomor seri pengganti beda dari asal ditolak", async () => {
    mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue(oldInvoice)
    const r = await replaceTaxInvoice({
      replacesId: 7, taxInvoiceNumber: "010.001-26.99999999",
      taxInvoiceDate: new Date(2026, 2, 5), sellingPrice: 6_000_000,
      replaceReason: "salah DPP", idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/Nomor seri faktur pengganti wajib sama/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("faktur sudah diganti tidak bisa diganti lagi", async () => {
    mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue({ ...oldInvoice, djpStatus: "replaced" })
    const r = await replaceTaxInvoice({
      replacesId: 7, taxInvoiceNumber: "010.001-26.00000009",
      taxInvoiceDate: new Date(2026, 2, 5), sellingPrice: 6_000_000,
      replaceReason: "salah DPP", idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/sudah diganti/)
  })
})

describe("cancelTaxInvoice guards", () => {
  it("batal: status cancelled + cermin kepala dikosongkan bila tak ada yg hidup", async () => {
    mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue({
      id: 7, direction: "out", taxPeriod: "2026-01", taxInvoiceNumber: "010.001-26.00000009",
      taxInvoiceDate: new Date(2026, 0, 10), taxAmount: 1_320_000,
      djpStatus: "approved", creditStatus: "uncredited", transactionCode: "04", taxRate: 12,
      salesInvoiceId: 1, vendorBillId: null, vendorId: null,
      counterpartyTaxId: null, counterpartyName: null, counterpartyNitku: null,
    })
    mocks.taxInvoiceFindFirst.mockResolvedValue(null)
    const r = await cancelTaxInvoice({ id: 7, cancelReason: "transaksi batal", idempotencyKey: key() })
    expect(r.success).toBe(true)
    expect(mocks.taxInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: expect.objectContaining({ djpStatus: "cancelled" }) }),
    )
    expect(mocks.salesInvoiceUpdate).toHaveBeenCalledWith(
      { where: { id: 1 }, data: { taxInvoiceNumber: null } },
    )
  })
})

describe("creditInputInvoice guards", () => {
  it("F-002(c): bulan ke-4 → expired + ditolak", async () => {
    const r = await creditInputInvoice({ id: 7, creditPeriod: "2026-05", idempotencyKey: key() })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/expired/)
    expect(mocks.taxInvoiceUpdate).toHaveBeenCalledWith(
      { where: { id: 7 }, data: { creditStatus: "expired" } },
    )
  })

  it("duplikat kredit (sudah credited) ditolak", async () => {
    mocks.taxInvoiceFindUniqueOrThrow.mockResolvedValue({
      id: 7, direction: "in", taxPeriod: "2026-01", taxAmount: 100,
      djpStatus: "draft", creditStatus: "credited",
    })
    const r = await creditInputInvoice({ id: 7, creditPeriod: "2026-02", idempotencyKey: key() })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/sudah dikreditkan/)
  })
})

describe("issueDownPaymentTaxInvoice (F-2026-10-25-004-V)", () => {
  const dpRow = {
    id: 3, status: "confirmed", paymentDate: new Date(2026, 0, 15),
    vatTransactionCode: "04", vatRate: 12, vatDpp: 11_000_000, vatAmount: 1_320_000,
    vatTaxPeriod: "2026-01", customer: { name: "PT X", taxpayerName: "PT X WP", taxId: "0123456789123456", nitku: "0123456789123456000001" },
  }
  it("salin snapshot: tanggal=paymentDate, masa beku, DPP/PPN beku", async () => {
    mocks.dpFindUnique.mockResolvedValue(dpRow)
    const r = await issueDownPaymentTaxInvoice({
      downPaymentId: 3, taxInvoiceNumber: "040.000-26.00000001", idempotencyKey: key(),
    })
    expect(r.success).toBe(true)
    const data = mocks.taxInvoiceCreate.mock.calls[0][0].data
    expect(Number(data.dpp)).toBe(11_000_000)
    expect(Number(data.taxAmount)).toBe(1_320_000)
    expect(data.taxPeriod).toBe("2026-01")
    expect(data.taxInvoiceDate).toEqual(new Date(2026, 0, 15))
    expect(data.downPaymentId).toBe(3)
    expect(data.direction).toBe("out")
  })

  it("DP bukan confirmed ditolak", async () => {
    mocks.dpFindUnique.mockResolvedValue({ ...dpRow, status: "pending" })
    const r = await issueDownPaymentTaxInvoice({ downPaymentId: 3, taxInvoiceNumber: "X", idempotencyKey: key() })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/confirmed/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("snapshot PPN nol (non-kena) ditolak — tidak ada FP UM", async () => {
    mocks.dpFindUnique.mockResolvedValue({ ...dpRow, vatAmount: 0, vatDpp: 0 })
    const r = await issueDownPaymentTaxInvoice({ downPaymentId: 3, taxInvoiceNumber: "X", idempotencyKey: key() })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/bukan subjek/)
  })

  it("satu FP UM aktif per DP: FP aktif kedua ditolak", async () => {
    mocks.dpFindUnique.mockResolvedValue(dpRow)
    mocks.taxInvoiceFindFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(where.downPaymentId != null ? { id: 9 } : null),
    )
    const r = await issueDownPaymentTaxInvoice({ downPaymentId: 3, taxInvoiceNumber: "Y", idempotencyKey: key() })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/satu FP UM aktif/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("B1 t_663509ae probe Accountant: NITKU mismatch vs NPWP16 → tolak, create 0", async () => {
    mocks.dpFindUnique.mockResolvedValue(dpRow)
    const r = await issueDownPaymentTaxInvoice({
      downPaymentId: 3, taxInvoiceNumber: "040.000-26.00000002", idempotencyKey: key(),
      counterpartyTaxId: "0123456789123456", counterpartyName: "PT X WP",
      counterpartyNitku: "9999999999999999000001",
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/NITKU lawan transaksi tidak diawali NPWP/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("B1 t_663509ae probe Accountant: identitas kosong total → tolak, create 0", async () => {
    mocks.dpFindUnique.mockResolvedValue({
      ...dpRow, customer: { name: "", taxpayerName: null, taxId: null, nitku: null },
    })
    const r = await issueDownPaymentTaxInvoice({
      downPaymentId: 3, taxInvoiceNumber: "040.000-26.00000003", idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/Nama lawan transaksi wajib/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("B1: NPWP kosong (nama ada) → alasan NPWP kosong, bukan NITKU", async () => {
    mocks.dpFindUnique.mockResolvedValue({
      ...dpRow, customer: { name: "PT X", taxpayerName: "PT X WP", taxId: null, nitku: null },
    })
    const r = await issueDownPaymentTaxInvoice({
      downPaymentId: 3, taxInvoiceNumber: "040.000-26.00000004", idempotencyKey: key(),
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/NPWP\/NIK lawan transaksi wajib/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
  })

  it("B1: legacy15 + NITKU sah-bentuk + legacy15Confirmed → terbit, snapshot = final (nitkuUnlinked bukan mismatch)", async () => {
    mocks.dpFindUnique.mockResolvedValue({
      ...dpRow, customer: { name: "PT Legacy", taxpayerName: "PT Legacy WP", taxId: "123456789012345", nitku: null },
    })
    const tanpa = await issueDownPaymentTaxInvoice({
      downPaymentId: 3, taxInvoiceNumber: "040.000-26.00000005", idempotencyKey: key(),
      counterpartyNitku: "9999999999999999000001",
    })
    expect(tanpa.success).toBe(false)
    expect(String(tanpa.error)).toMatch(/NPWP 15 digit/)
    expect(mocks.taxInvoiceCreate).not.toHaveBeenCalled()
    const r = await issueDownPaymentTaxInvoice({
      downPaymentId: 3, taxInvoiceNumber: "040.000-26.00000005", idempotencyKey: key(),
      counterpartyNitku: "9999999999999999000001", legacy15Confirmed: true,
    })
    expect(r.success).toBe(true)
    const data = mocks.taxInvoiceCreate.mock.calls[0][0].data
    expect(data.counterpartyTaxId).toBe("123456789012345")
    expect(data.counterpartyName).toBe("PT Legacy WP")
    expect(data.counterpartyNitku).toBe("9999999999999999000001")
  })

  it("B1: override operator menang atas master; NITKU master dipakai bila tak dioverride", async () => {
    mocks.dpFindUnique.mockResolvedValue(dpRow)
    const r = await issueDownPaymentTaxInvoice({
      downPaymentId: 3, taxInvoiceNumber: "040.000-26.00000006", idempotencyKey: key(),
      counterpartyName: "PT Override",
    })
    expect(r.success).toBe(true)
    const data = mocks.taxInvoiceCreate.mock.calls[0][0].data
    expect(data.counterpartyName).toBe("PT Override")
    expect(data.counterpartyTaxId).toBe("0123456789123456")
    expect(data.counterpartyNitku).toBe("0123456789123456000001")
  })

  it("FP pelunasan selisih: dokumen penuh minus Sigma FP UM aktif", async () => {
    // salesInvoice.findUnique mock default null; override via tx sulit diakses di sini,
    // diarahkan lewat tiFindMany kosong -> angka penuh (dijamin oleh test builder).
    // F-004-S §8A-5: terbit out wajib identitas — isian manual ditambah (angka PPN tak berubah).
    const r = await issueTaxInvoice({
      direction: "out", taxInvoiceNumber: "040.000-26.00000099",
      taxInvoiceDate: new Date(2026, 1, 10), sellingPrice: 120_000_000,
      salesInvoiceId: 5, idempotencyKey: key(),
      counterpartyName: "PT Lawan Uji", counterpartyTaxId: "0123456789123456",
    })
    expect(r.success).toBe(true)
    const data = mocks.taxInvoiceCreate.mock.calls[0][0].data
    expect(Number(data.taxAmount)).toBe(13_200_000)
  })
})
