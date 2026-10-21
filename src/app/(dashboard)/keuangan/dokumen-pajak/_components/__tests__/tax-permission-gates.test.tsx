// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/tax-documents.actions", () => ({
  issueTaxInvoiceAction: vi.fn(),
  replaceTaxInvoiceAction: vi.fn(),
  cancelTaxInvoiceAction: vi.fn(),
  creditInputInvoiceAction: vi.fn(),
  issueWithholdingCertificateAction: vi.fn(),
  revokeWithholdingCertificateAction: vi.fn(),
  settleWithholdingTaxAction: vi.fn(),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

import { WithholdingLifecycleActions } from "../withholding-certificate-form"
import { TaxInvoiceLifecycleActions } from "../tax-invoice-form"
import type { TaxOption } from "../tax-doc-submit"

const CERTS: TaxOption[] = [{ value: "1", label: "BP-001 — PT Uji (Rp1.000.000)" }]
const OPTS: TaxOption[] = [{ value: "1", label: "PPh 23" }]

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("F-048 gerbang izin UI faktur/bupot — perilaku komponen (vonis BOT 4 F-048-V)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("canSettle=false: form Setor PPh tidak dirender, form Cabut tampil (BR-UI-048-06)", () => {
    const { container, root } = mount(
      <WithholdingLifecycleActions certificates={CERTS} withholdingTypes={OPTS} liabilityAccounts={OPTS} paymentAccounts={OPTS} canRevoke canSettle={false} />,
    )
    expect(container.textContent).toContain("Cabut Bukti Potong")
    expect(container.textContent).not.toContain("Setor PPh per Masa")
    act(() => root.unmount())
  })

  it("canRevoke=false: form Cabut tidak dirender, form Setor tampil (NAV-2)", () => {
    const { container, root } = mount(
      <WithholdingLifecycleActions certificates={CERTS} withholdingTypes={OPTS} liabilityAccounts={OPTS} paymentAccounts={OPTS} canRevoke={false} canSettle />,
    )
    expect(container.textContent).not.toContain("Cabut Bukti Potong")
    expect(container.textContent).toContain("Setor PPh per Masa")
    act(() => root.unmount())
  })

  it("tanpa izin cabut maupun setor: tidak ada aksi tulis sama sekali (fail-closed)", () => {
    const { container, root } = mount(
      <WithholdingLifecycleActions certificates={CERTS} withholdingTypes={OPTS} liabilityAccounts={OPTS} paymentAccounts={OPTS} canRevoke={false} canSettle={false} />,
    )
    expect(container.textContent?.trim()).toBe("")
    act(() => root.unmount())
  })

  it("faktur terbit kosong: panel lifecycle faktur tidak dirender", () => {
    const { container, root } = mount(<TaxInvoiceLifecycleActions invoices={[]} />)
    expect(container.textContent?.trim()).toBe("")
    act(() => root.unmount())
  })

  it("faktur terbit ada: panel lifecycle faktur tampil", () => {
    const { container, root } = mount(<TaxInvoiceLifecycleActions invoices={CERTS} />)
    expect(container.textContent).toContain("Pengganti, Pembatalan, dan Kredit Masukan")
    act(() => root.unmount())
  })
})

describe("F-048 gerbang izin UI faktur/bupot — string izin persis per permukaan", () => {
  const fakturPage = source("src/app/(dashboard)/keuangan/dokumen-pajak/faktur/tambah/page.tsx")
  const bupotPage = source("src/app/(dashboard)/keuangan/dokumen-pajak/bupot/tambah/page.tsx")
  const setorPage = source("src/app/(dashboard)/keuangan/penyetoran-pajak/page.tsx")
  const setorTambah = source("src/app/(dashboard)/keuangan/penyetoran-pajak/tambah/page.tsx")
  const laporanPajak = source("src/app/(dashboard)/laporan/pajak/[[...segments]]/page.tsx")
  const navigation = source("src/components/layout/navigation.ts")

  it("faktur: page + lifecycle digerbang create_tax_invoices, tanpa izin setor (BR-UI-048-02)", () => {
    expect(fakturPage).toContain('requirePermission("create_tax_invoices")')
    expect(fakturPage).toContain('hasPermission("create_tax_invoices")')
    expect(fakturPage).not.toContain("create_tax_payments")
  })

  it("bupot: page digerbang manage_withholding_certificates; canSettle hasPermission create_tax_payments", () => {
    expect(bupotPage).toContain('requirePermission("manage_withholding_certificates")')
    expect(bupotPage).toContain('hasPermission("create_tax_payments")')
    expect(bupotPage).toContain("canRevoke")
  })

  it("setor: daftar view_tax_payments + CanCreate create_tax_payments; tambah require create_tax_payments", () => {
    expect(setorPage).toContain('requirePermission("view_tax_payments")')
    expect(setorPage).toContain('permission="create_tax_payments"')
    expect(setorTambah).toContain('requirePermission("create_tax_payments")')
  })

  it("laporan pajak: view_reports; tombol terbit hanya tautan bergerbang izin dokumen", () => {
    expect(laporanPajak).toContain('requirePermission("view_reports")')
    expect(laporanPajak).toContain('permission="create_tax_invoices"')
    expect(laporanPajak).toContain('permission="manage_withholding_certificates"')
    expect(laporanPajak).not.toContain('permission="create_tax_payments"')
  })

  it("navigasi: Dokumen Pajak=create_tax_invoices, Bukti Potong=manage_withholding_certificates, Penyetoran=view_tax_payments", () => {
    expect(navigation).toContain('label: "Dokumen Pajak", href: "/keuangan/dokumen-pajak/faktur/tambah", icon: FileCheck, permission: "create_tax_invoices"')
    expect(navigation).toContain('label: "Bukti Potong", href: "/keuangan/dokumen-pajak/bupot/tambah", icon: Receipt, permission: "manage_withholding_certificates"')
    expect(navigation).toContain('label: "Penyetoran Pajak", href: "/keuangan/penyetoran-pajak", icon: BadgeDollarSign, permission: "view_tax_payments"')
  })
})
