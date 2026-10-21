export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { prisma } from "@/lib/db/prisma"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import type { PermissionName } from "@/lib/setup/base-data"

/**
 * Izin terbit faktur dari F-034 (PR #301, belum di main saat file ini ditulis).
 * ponytail: literal + cast lokal supaya tsc main bersih; sesudah #301 merged
 * ganti dengan "create_tax_invoices" polos dan hapus cast ini.
 */
const CREATE_TAX_INVOICES = "create_tax_invoices" as PermissionName
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TaxInvoiceForm, TaxInvoiceLifecycleActions, type TaxOption } from "@/app/(dashboard)/keuangan/dokumen-pajak/_components/tax-invoice-form"
import { formatCurrency } from "@/lib/utils/format"

export const metadata: Metadata = { title: "Terbitkan Faktur Pajak" }

const moneyOption = (documentNo: string, amount: unknown, party: string): TaxOption => ({
  value: "",
  label: `${documentNo} — ${party} (${formatCurrency(Number(amount))})`,
})

/**
 * Terbit faktur pajak (F-2026-10-21-001..002, tahap frontend).
 *
 * Izin terbit faktur = `create_tax_invoices` (F-034, PR #301); action server
 * menegakkan izin yang sama. Daftar dokumen terbit untuk aksi
 * pengganti/batal/kredit hanya tampil bagi pemegang izin ini. Loader di
 * sini murni opsi tautan + daftar pilih — DPP/PPN tetap dihitung service.
 */
export default async function CreateTaxInvoicePage() {
  await requirePermission(CREATE_TAX_INVOICES)

  const [salesInvoices, vendorBills, vendors, issued] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: ["posted", "partial", "paid"] }, deletedAt: null },
      orderBy: { date: "desc" },
      take: 100,
      select: { id: true, documentNo: true, grandTotal: true, customer: { select: { name: true } } },
    }),
    prisma.vendorBill.findMany({
      where: { status: { in: ["posted", "partial", "paid"] }, deletedAt: null },
      orderBy: { date: "desc" },
      take: 100,
      select: { id: true, documentNo: true, grandTotal: true, vendor: { select: { name: true } } },
    }),
    prisma.vendor.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      take: 200,
      select: { id: true, name: true },
    }),
    prisma.taxInvoice.findMany({
      where: { djpStatus: { in: ["draft", "approved"] } },
      orderBy: { taxInvoiceDate: "desc" },
      take: 100,
      select: { id: true, taxInvoiceNumber: true, direction: true, taxAmount: true, counterpartyName: true },
    }),
  ])

  const canLifecycle = await hasPermission(CREATE_TAX_INVOICES)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Dokumen Pajak", href: "/keuangan/dokumen-pajak/faktur/tambah" },
          { label: "Terbitkan Faktur Pajak" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Terbitkan Faktur Pajak</h1>
      <TaxInvoiceForm
        salesInvoices={salesInvoices.map((inv) => ({ ...moneyOption(inv.documentNo, inv.grandTotal, inv.customer.name), value: String(inv.id) }))}
        vendorBills={vendorBills.map((bill) => ({ ...moneyOption(bill.documentNo, bill.grandTotal, bill.vendor.name), value: String(bill.id) }))}
        vendors={vendors.map((v) => ({ value: String(v.id), label: v.name }))}
      />
      {canLifecycle && (
        <TaxInvoiceLifecycleActions
          invoices={issued.map((inv) => ({
            value: String(inv.id),
            label: `${inv.taxInvoiceNumber} — ${inv.direction === "out" ? "Keluaran" : "Masukan"}${inv.counterpartyName ? ` — ${inv.counterpartyName}` : ""} (${formatCurrency(Number(inv.taxAmount))})`,
          }))}
        />
      )}
    </div>
  )
}
