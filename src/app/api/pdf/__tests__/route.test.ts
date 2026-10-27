import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  authFn: vi.fn(),
  hasPermission: vi.fn(),
  grants: new Set<string>(),
  loadBalanceSheetStatement: vi.fn(),
  loadIncomeStatementStatement: vi.fn(),
  loadAssetRegister: vi.fn(),
  loadAssetMovement: vi.fn(),
  loadAssetDisposals: vi.fn(),
  loadTrialBalanceReport: vi.fn(),
  loadIncomeStatementByCostCenter: vi.fn(),
  loadPayrollRows: vi.fn(),
  loadWithholdingSummary: vi.fn(),
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/auth/auth", () => ({ auth: (...args: unknown[]) => mocks.authFn(...args) }))
// Permission-aware: hasPermission(perm) true hanya bila perm ada di grants.
// Sengaja TANPA hasAnyPermission — gerbang payroll wajib hasPermission tunggal.
vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...args: unknown[]) => mocks.hasPermission(...args),
}))
vi.mock("@/lib/reports/payroll-reports-data", () => ({
  loadPayrollRows: (...args: unknown[]) => mocks.loadPayrollRows(...args),
}))
vi.mock("@/lib/reports/tax-summary-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/tax-summary-data")>()
  return {
    ...actual,
    loadWithholdingSummary: (...args: unknown[]) => mocks.loadWithholdingSummary(...args),
  }
})
vi.mock("@/lib/reports/statement-data", () => ({
  loadBalanceSheetStatement: (...args: unknown[]) => mocks.loadBalanceSheetStatement(...args),
  loadIncomeStatementStatement: (...args: unknown[]) => mocks.loadIncomeStatementStatement(...args),
  loadIncomeStatementByCostCenter: (...args: unknown[]) => mocks.loadIncomeStatementByCostCenter(...args),
}))
vi.mock("@/lib/reports/asset-reports-data", () => ({
  loadAssetRegister: (...args: unknown[]) => mocks.loadAssetRegister(...args),
  loadAssetMovement: (...args: unknown[]) => mocks.loadAssetMovement(...args),
  loadAssetDisposals: (...args: unknown[]) => mocks.loadAssetDisposals(...args),
}))
vi.mock("@/lib/reports/trial-balance-data", () => ({
  loadTrialBalanceReport: (...args: unknown[]) => mocks.loadTrialBalanceReport(...args),
}))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: (...args: unknown[]) => mocks.getSystemSettings(...args),
}))

vi.spyOn(console, "error").mockImplementation(() => {})

const STATEMENT = {
  table: {
    columns: [
      { header: "Kode", align: "left" },
      { header: "Deskripsi", align: "left" },
      { header: "Per 31 Oktober 2026", align: "right" },
    ],
    rows: [
      { kind: "group", label: "Aset" },
      { kind: "line", id: 1, code: "1000", name: "Kas", level: 0, hasChildren: false, values: ["5.000.000"] },
      { kind: "grand", label: "Total Kewajiban dan Ekuitas", values: ["5.000.000"] },
    ],
  },
  asOfLabel: "31 Oktober 2026",
  periodLabel: "Per 31 Oktober 2026",
  periodCaption: "Per 31 Oktober 2026",
  columnLabel: "1 Okt - 31 Okt 2026",
}

const ASSET_REGISTER = {
  register: {
    table: {
      columns: [
        { header: "Kode", align: "left", width: 20 },
        { header: "Nama Aset", align: "left", width: 75 },
        { header: "Status", align: "left", width: 24 },
        { header: "Tgl Perolehan", align: "center", width: 26 },
        { header: "Harga Perolehan", align: "right", width: 40 },
        { header: "Akum. Penyusutan", align: "right", width: 40 },
        { header: "Nilai Buku", align: "right", width: 38 },
      ],
      rows: [
        { kind: "group", label: "Peralatan Bengkel" },
        {
          kind: "data",
          cells: ["AST-001", "Mesin Bubut", "Aktif", "10/01/2026", "100.000.000", "20.000.000", "80.000.000"],
        },
      ],
    },
    totalCost: 100_000_000,
    totalAccumulatedDepreciation: 20_000_000,
    totalBookValue: 80_000_000,
    assetCount: 1,
    disposedCount: 0,
  },
  asOfLabel: "31 Oktober 2026",
  periodLabel: "Per 31 Oktober 2026",
  periodCaption: "Per 31 Oktober 2026",
}

const settings = {
  companyName: "PT Yara ERP",
  companyAddress: "Jl. Contoh No 35",
  companyVillage: "Kenanga",
  companyDistrict: "Cipondoh",
  companyCity: "Kota Tangerang",
  companyProvince: "Banten",
  companyPostalCode: "15146",
  companyPhone: "08123",
  companyEmail: "a@b.com",
  companyWebsite: "https://test",
  // Null supaya pengambilan logo tidak menyentuh jaringan pada test.
  companyLogo: null,
}

function request(query: string): Request {
  return new Request(`http://localhost/api/pdf?${query}`) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.grants = new Set(["view_reports", "view_payroll_reports"])
  mocks.authFn.mockResolvedValue({ user: { name: "Budi", email: "budi@test.com" } })
  mocks.hasPermission.mockImplementation(async (perm: string) => mocks.grants.has(perm))
  mocks.getSystemSettings.mockResolvedValue(settings)
  mocks.loadPayrollRows.mockResolvedValue({
    rows: [],
    draftSlips: 0,
    duplicateEmployees: [],
    periodLabel: "Periode Okt 2026",
    periodCaption: "Periode Okt 2026",
  })
  mocks.loadWithholdingSummary.mockResolvedValue({
    table: { columns: [{ header: "Jenis", align: "left" }], rows: [] },
    periodLabel: "Periode 2026",
    periodCaption: "Periode 2026",
  })
  mocks.loadBalanceSheetStatement.mockResolvedValue(STATEMENT)
  mocks.loadIncomeStatementStatement.mockResolvedValue(STATEMENT)
  mocks.loadAssetRegister.mockResolvedValue(ASSET_REGISTER)
  mocks.loadTrialBalanceReport.mockResolvedValue({
    table: {
      columns: [
        { header: "Kode", align: "left", width: 18 },
        { header: "Nama Akun", align: "left", width: 82 },
        { header: "Debit", align: "right", width: 40 },
        { header: "Kredit", align: "right", width: 40 },
      ],
      rows: [
        { kind: "data", cells: ["1101", "Kas & Bank", "1.000.000", ""] },
        { kind: "total", grand: true, label: "Total", cells: ["1.000.000", "1.000.000"] },
      ],
    },
    landscape: false,
    asOfLabel: "31 Oktober 2026",
    periodLabel: "Per 31 Oktober 2026",
    periodCaption: "Per 31 Oktober 2026",
  })
})

describe("GET /api/pdf", () => {
  describe("gerbang payroll fail-closed (view_payroll_reports saja)", () => {
    const PAYROLL_KEYS = ["gaji-karyawan", "pph-21", "porsi-gaji"]

    it.each(PAYROLL_KEYS)("menolak %s untuk sesi hanya-view_reports (tanpa menyentuh loader)", async (key) => {
      mocks.grants = new Set(["view_reports"])
      const res = await GET(request(`laporan=${key}&periode=2026-10`))
      expect(res.status).toBe(403)
      expect(mocks.loadPayrollRows).not.toHaveBeenCalled()
      expect(mocks.loadWithholdingSummary).not.toHaveBeenCalled()
    })

    it.each(PAYROLL_KEYS)("mengizinkan %s untuk sesi view_payroll_reports (tanpa view_reports)", async (key) => {
      mocks.grants = new Set(["view_payroll_reports"])
      const res = await GET(request(`laporan=${key}&periode=2026-10`))
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/pdf")
    })

    it.each(PAYROLL_KEYS)("menolak %s tanpa keduanya", async (key) => {
      mocks.grants = new Set()
      const res = await GET(request(`laporan=${key}&periode=2026-10`))
      expect(res.status).toBe(403)
    })
  })

  describe("bukti-potong-pph gerbang laporan pajak umum (bukan payroll)", () => {
    // Loader-nya VendorBill pemasok (loadWithholdingSummary) — nol data
    // karyawan. Vonis BOT 4 F-2026-10-21-034: pelaporan bupot tetap
    // view_reports; putusan Lead opsi (a) atas sanggahan PR #316.
    it("mengizinkan sesi hanya-view_reports dan memanggil loader bupot", async () => {
      mocks.grants = new Set(["view_reports"])
      const res = await GET(request("laporan=bukti-potong-pph&periode=2026-10"))
      expect(res.status).toBe(200)
      expect(mocks.loadWithholdingSummary).toHaveBeenCalledTimes(1)
      expect(mocks.loadPayrollRows).not.toHaveBeenCalled()
    })

    it("menolak sesi hanya-view_payroll_reports (izin gaji bukan izin pajak)", async () => {
      mocks.grants = new Set(["view_payroll_reports"])
      const res = await GET(request("laporan=bukti-potong-pph&periode=2026-10"))
      expect(res.status).toBe(403)
      expect(mocks.loadWithholdingSummary).not.toHaveBeenCalled()
    })
  })

  it("menolak permintaan tanpa sesi", async () => {
    mocks.authFn.mockResolvedValue(null)
    const res = await GET(request("laporan=neraca&periode=2026-10"))
    expect(res.status).toBe(401)
  })

  it("menolak pengguna tanpa izin view_reports", async () => {
    mocks.hasPermission.mockResolvedValue(false)
    const res = await GET(request("laporan=neraca&periode=2026-10"))
    expect(res.status).toBe(403)
  })

  it("mengembalikan berkas PDF inline untuk neraca", async () => {
    const res = await GET(request("laporan=neraca&periode=2026-10"))

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("content-disposition")).toBe('inline; filename="Neraca-2026-10.pdf"')
    expect(res.headers.get("cache-control")).toBe("no-store")

    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-")
  })

  it("memaksa unduhan saat unduh=1", async () => {
    const res = await GET(request("laporan=neraca&periode=2026-10&unduh=1"))
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Neraca-2026-10.pdf"')
  })

  it("meneruskan opsi tampilan dan kolom persen ke loader laba rugi", async () => {
    const res = await GET(
      request("laporan=laba-rugi&periode=2026-10-01_2026-10-15&total=1&kolomPersen=1"),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="Laba-Rugi-2026-10-01_2026-10-15.pdf"',
    )

    const [period, options, showPercent] = mocks.loadIncomeStatementStatement.mock.calls[0]
    expect(options.totalsOnly).toBe(true)
    expect(showPercent).toBe(true)
    expect(period.start).toEqual(new Date(2026, 9, 1))
    expect(period.end.getHours()).toBe(23)
  })

  it("mengingat slug periode menjadi bentuk kanonik untuk nama berkas", async () => {
    // Satu bulan penuh diringkas menjadi "2026-10" — nama unduhan jadi stabil.
    const res = await GET(request("laporan=laba-rugi&periode=2026-10-01_2026-10-31"))
    expect(res.headers.get("content-disposition")).toBe('inline; filename="Laba-Rugi-2026-10.pdf"')
  })

  it("memakai neraca sebagai posisi akhir periode", async () => {
    await GET(request("laporan=neraca&periode=2026-10"))

    const [asOfDate] = mocks.loadBalanceSheetStatement.mock.calls[0]
    expect(asOfDate).toEqual(new Date(2026, 9, 31, 23, 59, 59, 999))
  })

  describe("aset-tetap", () => {
    it("mengembalikan berkas PDF registry aset", async () => {
      const res = await GET(request("laporan=aset-tetap&periode=2026-10"))

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/pdf")
      expect(res.headers.get("content-disposition")).toBe(
        'inline; filename="Daftar-Aset-Tetap-2026-10.pdf"',
      )

      const bytes = new Uint8Array(await res.arrayBuffer())
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-")
    })

    it("memakai posisi akhir periode dan menyembunyikan aset dilepas secara bawaan", async () => {
      await GET(request("laporan=aset-tetap&periode=2026-10"))

      const [asOfDate, includeDisposed] = mocks.loadAssetRegister.mock.calls[0]
      expect(asOfDate).toEqual(new Date(2026, 9, 31, 23, 59, 59, 999))
      expect(includeDisposed).toBe(false)
    })

    it("meneruskan termasukDilepas=1", async () => {
      await GET(request("laporan=aset-tetap&periode=2026-10&termasukDilepas=1"))
      expect(mocks.loadAssetRegister.mock.calls[0][1]).toBe(true)
    })
  })

  describe("mutasi & disposisi aset", () => {
    const movementReport = {
      movement: {
        table: ASSET_REGISTER.register.table,
        opening: { cost: 0, accumulated: 0, bookValue: 0 },
        additions: { cost: 0, accumulated: 0, bookValue: 0 },
        depreciation: { cost: 0, accumulated: 0, bookValue: 0 },
        disposals: { cost: 0, accumulated: 0, bookValue: 0 },
        closing: { cost: 0, accumulated: 0, bookValue: 0 },
        isTiedOut: true,
        disposalCount: 0,
      },
      periodLabel: "Periode 1 Okt 2026 – 31 Okt 2026",
      periodCaption: "Periode 1 Okt 2026 – 31 Okt 2026",
    }

    const disposalReport = {
      disposal: {
        table: ASSET_REGISTER.register.table,
        totals: { cost: 0, accumulated: 0, bookValue: 0, proceeds: 0, gainLoss: 0 },
        count: 0,
      },
      periodLabel: "Periode 1 Okt 2026 – 31 Okt 2026",
      periodCaption: "Periode 1 Okt 2026 – 31 Okt 2026",
    }

    it("mengembalikan PDF mutasi aset dengan periode yang diminta", async () => {
      mocks.loadAssetMovement.mockResolvedValue(movementReport)

      const res = await GET(request("laporan=mutasi-aset&periode=2026-10"))

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/pdf")
      expect(res.headers.get("content-disposition")).toBe(
        'inline; filename="Mutasi-Aset-Tetap-2026-10.pdf"',
      )

      const [period] = mocks.loadAssetMovement.mock.calls[0]
      expect(period.start).toEqual(new Date(2026, 9, 1))
      expect(period.end.getHours()).toBe(23)

      const bytes = new Uint8Array(await res.arrayBuffer())
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-")
    })

    it("mengembalikan PDF daftar disposisi aset", async () => {
      mocks.loadAssetDisposals.mockResolvedValue(disposalReport)

      const res = await GET(request("laporan=disposisi-aset&periode=2026-10"))

      expect(res.status).toBe(200)
      expect(res.headers.get("content-disposition")).toBe(
        'inline; filename="Daftar-Disposisi-Aset-2026-10.pdf"',
      )
      expect(mocks.loadAssetDisposals).toHaveBeenCalledTimes(1)
      expect(mocks.loadAssetMovement).not.toHaveBeenCalled()
    })
  })

  describe("neraca-saldo", () => {
    it("mengembalikan PDF neraca saldo posisi akhir periode", async () => {
      const res = await GET(request("laporan=neraca-saldo&periode=2026-10"))

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/pdf")
      expect(res.headers.get("content-disposition")).toBe(
        'inline; filename="Neraca-Saldo-2026-10.pdf"',
      )

      const [asOfDate, compareDate] = mocks.loadTrialBalanceReport.mock.calls[0]
      expect(asOfDate).toEqual(new Date(2026, 9, 31, 23, 59, 59, 999))
      expect(compareDate).toBeNull()
    })

    it("meneruskan tanggal pembanding ke loader", async () => {
      await GET(request("laporan=neraca-saldo&periode=2026-10&pembanding=2026-09-30"))

      const [, compareDate] = mocks.loadTrialBalanceReport.mock.calls[0]
      // B9: akhir hari penuh (.999) seperti layar — jurnal 23:59:59.500
      // tidak boleh hilang di PDF.
      expect(compareDate).toEqual(new Date("2026-09-30T23:59:59.999"))
    })
  })

  describe("laba-rugi-pusat-biaya", () => {
    it("mengembalikan PDF laba rugi satu pusat biaya", async () => {
      mocks.loadIncomeStatementByCostCenter.mockResolvedValue({
        table: {
          columns: [
            { header: "Kode", align: "left" },
            { header: "Deskripsi", align: "left" },
            { header: "1 Okt - 31 Okt 2026", align: "right" },
          ],
          rows: [{ kind: "grand", label: "Laba Bersih", values: ["1.000.000"] }],
        },
        columnLabel: "1 Okt - 31 Okt 2026",
        costCenterLabel: "CC-01 — Bengkel",
        totals: { netProfit: 1_000_000 },
        periodLabel: "Periode 1 Okt 2026 – 31 Okt 2026",
        periodCaption: "Dari 01 Okt 2026 s/d 31 Okt 2026",
      })

      const res = await GET(
        request(
          "laporan=laba-rugi-pusat-biaya&periode=2026-10&costCenterId=7&tanggalMulai=2026-10-01&tanggalSelesai=2026-10-31",
        ),
      )

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/pdf")
      expect(res.headers.get("content-disposition")).toBe(
        'inline; filename="Laba-Rugi-per-Pusat-Biaya-2026-10.pdf"',
      )

      const [input] = mocks.loadIncomeStatementByCostCenter.mock.calls[0]
      expect(input.costCenterId).toBe(7)
      expect(input.start).toEqual(new Date(2026, 9, 1))
      expect(input.end.getHours()).toBe(23)
    })

    it("tetap membuat lembar (tanpa error) bila pusat biaya belum dipilih", async () => {
      mocks.loadIncomeStatementByCostCenter.mockResolvedValue({
        table: {
          columns: [{ header: "Kode", align: "left" }],
          rows: [{ kind: "notice", text: "Pilih pusat biaya." }],
        },
        columnLabel: "1 Okt - 31 Okt 2026",
        costCenterLabel: null,
        totals: { netProfit: 0 },
        periodLabel: "Periode 1 Okt 2026 – 31 Okt 2026",
        periodCaption: "Dari 01 Okt 2026 s/d 31 Okt 2026",
      })

      const res = await GET(request("laporan=laba-rugi-pusat-biaya&periode=2026-10"))

      expect(res.status).toBe(200)
      expect(mocks.loadIncomeStatementByCostCenter.mock.calls[0][0].costCenterId).toBeNull()
    })
  })

  it("menolak laporan yang tidak didukung sebelum menyentuh data", async () => {
    const res = await GET(request("laporan=kunci-tak-ada&periode=2026-10"))
    expect(res.status).toBe(400)
    expect(mocks.loadAssetRegister).not.toHaveBeenCalled()
    expect(mocks.loadAssetMovement).not.toHaveBeenCalled()
    expect(mocks.loadAssetDisposals).not.toHaveBeenCalled()
    expect(mocks.loadTrialBalanceReport).not.toHaveBeenCalled()
  })

  it("mengembalikan 500 saat pembuatan PDF gagal", async () => {
    mocks.loadBalanceSheetStatement.mockRejectedValue(new Error("boom"))
    const res = await GET(request("laporan=neraca&periode=2026-10"))
    expect(res.status).toBe(500)
  })
})
