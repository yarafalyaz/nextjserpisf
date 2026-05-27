export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

function DisplayField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted uppercase tracking-wide">{label}</span>
      <span className="text-[0.9375rem] text-foreground font-medium">{value || "-"}</span>
    </div>
  )
}

function BoolField({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted uppercase tracking-wide">{label}</span>
      <span className={`text-[0.9375rem] font-medium ${value ? "text-success" : "text-muted"}`}>{value ? "Ya" : "Tidak"}</span>
    </div>
  )
}

export default async function SettingsPage() {
  await requirePermission("manage_settings")

  const settings = await prisma.systemSetting.findFirst()
  const accounts = await prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })

  function accountName(id: number | null | undefined): string {
    if (!id) return "Belum diset"
    const acc = accounts.find((a) => a.id === id)
    return acc ? `${acc.code} - ${acc.name}` : "Belum diset"
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Settings" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        <Link href="/settings/edit" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-all">
          Edit Settings
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5">
        {/* Company Info */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Informasi Perusahaan</h2>
          </div>
          <div className="p-4 px-5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Nama Perusahaan" value={settings?.companyName} />
              <DisplayField label="Email" value={settings?.companyEmail} />
              <DisplayField label="Telepon" value={settings?.companyPhone} />
              <DisplayField label="Website" value={settings?.companyWebsite} />
              <DisplayField label="NPWP" value={settings?.companyTaxId} />
              <DisplayField label="Provinsi" value={settings?.companyProvince} />
              <DisplayField label="Kota" value={settings?.companyCity} />
              <DisplayField label="Kecamatan" value={settings?.companyDistrict} />
              <DisplayField label="Kelurahan" value={settings?.companyVillage} />
              <DisplayField label="Kode Pos" value={settings?.companyPostalCode} />
              <DisplayField label="Latitude" value={settings?.companyLatitude ? Number(settings.companyLatitude).toString() : null} />
              <DisplayField label="Longitude" value={settings?.companyLongitude ? Number(settings.companyLongitude).toString() : null} />
            </div>
            {settings?.companyAddress && (
              <div className="mt-3">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Alamat</span>
                <p className="text-[0.9375rem] text-foreground font-medium mt-1">{settings.companyAddress}</p>
              </div>
            )}
            {settings?.companyLogo && (
              <div className="mt-3">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Logo</span>
                <img src={settings.companyLogo} alt="Logo" className="mt-1 w-16 h-16 object-contain rounded border border-default" />
              </div>
            )}
          </div>
        </div>

        {/* General Settings */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Pengaturan Umum</h2>
          </div>
          <div className="p-4 px-5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Metode Costing" value={settings?.costingMethod} />
              <DisplayField label="Awal Tahun Fiskal" value={`Bulan ${settings?.fiscalYearStartMonth || 1}`} />
              <DisplayField label="Kode Mata Uang" value={settings?.currencyCode} />
              <DisplayField label="Simbol Mata Uang" value={settings?.currencySymbol} />
              <DisplayField label="Locale" value={settings?.currencyLocale} />
              <DisplayField label="Format Nomor Dokumen (legacy)" value={settings?.documentNumberFormat} />
              <DisplayField label="Period Lock Date" value={settings?.periodLockDate ? settings.periodLockDate.toISOString().split("T")[0] : null} />
              <BoolField label="Tampilkan Is Active" value={settings?.showIsActiveField !== false} />
              <BoolField label="Tampilkan NPWP" value={settings?.showTaxId !== false} />
            </div>
          </div>
        </div>

        {/* Auto-Code Prefixes */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Prefix Kode Otomatis</h2>
          </div>
          <div className="p-4 px-5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Item" value={settings?.itemCodePrefix} />
              <BoolField label="Auto Item" value={settings?.enableAutoItemCode !== false} />
              <DisplayField label="Gudang" value={settings?.warehouseCodePrefix} />
              <BoolField label="Auto Gudang" value={settings?.enableAutoWarehouseCode !== false} />
              <DisplayField label="Rak" value={settings?.rackCodePrefix} />
              <BoolField label="Auto Rak" value={settings?.enableAutoRackCode !== false} />
              <DisplayField label="Baris" value={settings?.rowCodePrefix} />
              <BoolField label="Auto Baris" value={settings?.enableAutoRowCode !== false} />
              <DisplayField label="Customer" value={settings?.customerCodePrefix} />
              <BoolField label="Auto Customer" value={settings?.enableAutoCustomerCode !== false} />
              <DisplayField label="Karyawan" value={settings?.employeeCodePrefix} />
              <BoolField label="Auto Karyawan" value={settings?.enableAutoEmployeeCode !== false} />
              <DisplayField label="Vendor" value={settings?.vendorCodePrefix} />
              <BoolField label="Auto Vendor" value={settings?.enableAutoVendorCode !== false} />
            </div>
            <h3 className="text-sm font-semibold text-foreground mt-5 mb-3">Prefix Dokumen</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Quotation" value={settings?.quotationCodePrefix} />
              <DisplayField label="Asset" value={settings?.assetPrefix} />
              <DisplayField label="Sales Order" value={settings?.salesOrderPrefix} />
              <DisplayField label="Invoice" value={settings?.salesInvoicePrefix} />
              <DisplayField label="Payment" value={settings?.salesPaymentPrefix} />
              <DisplayField label="Down Payment" value={settings?.downPaymentPrefix} />
              <DisplayField label="Delivery Order" value={settings?.deliveryOrderPrefix} />
              <DisplayField label="Sales Return" value={settings?.salesReturnPrefix} />
              <DisplayField label="Purchase Request" value={settings?.purchaseRequestPrefix} />
              <DisplayField label="Purchase Order" value={settings?.purchaseOrderPrefix} />
              <DisplayField label="Goods Receipt" value={settings?.goodsReceiptPrefix} />
              <DisplayField label="Vendor Bill" value={settings?.vendorBillPrefix} />
              <DisplayField label="Vendor Payment" value={settings?.vendorPaymentPrefix} />
              <DisplayField label="Purchase Return" value={settings?.purchaseReturnPrefix} />
              <DisplayField label="Transfer" value={settings?.inventoryTransferPrefix} />
              <DisplayField label="Adjustment" value={settings?.stockAdjustmentPrefix} />
              <DisplayField label="Material Issue" value={settings?.materialIssuePrefix} />
              <DisplayField label="Stock Movement" value={settings?.stockMovementPrefix} />
              <DisplayField label="Work Order" value={settings?.workOrderPrefix} />
              <DisplayField label="Manufacturing Order" value={settings?.manufacturingOrderPrefix} />
              <DisplayField label="Jurnal" value={settings?.journalPrefix} />
              <DisplayField label="Expense" value={settings?.expensePrefix} />
              <DisplayField label="Petty Cash" value={settings?.pettyCashPrefix} />
              <DisplayField label="Rekonsiliasi" value={settings?.reconciliationPrefix} />
              <DisplayField label="Payroll" value={settings?.payrollPrefix} />
              <DisplayField label="Project" value={settings?.projectPrefix} />
              <DisplayField label="Ticket" value={settings?.ticketPrefix} />
              <DisplayField label="Lead" value={settings?.leadPrefix} />
              <DisplayField label="Timesheet" value={settings?.timesheetPrefix} />
            </div>
          </div>
        </div>

        {/* Overtime & Attendance */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Lembur & Kehadiran</h2>
          </div>
          <div className="p-4 px-5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Overtime Multiplier" value={settings?.overtimeMultiplier ? Number(settings.overtimeMultiplier).toString() : null} />
              <DisplayField label="Overtime Coefficient" value={settings?.overtimeCoefficient ? Number(settings.overtimeCoefficient).toString() : null} />
              <DisplayField label="Istirahat Makan Mulai" value={settings?.overtimeMealBreakStart} />
              <DisplayField label="Istirahat Makan Selesai" value={settings?.overtimeMealBreakEnd} />
              <DisplayField label="Radius Kehadiran (KM)" value={settings?.attendanceRadiusKm ? Number(settings.attendanceRadiusKm).toString() : null} />
              <DisplayField label="Denda Terlambat/Menit" value={settings?.latePenaltyPerMinute ? `Rp ${Number(settings.latePenaltyPerMinute).toLocaleString("id-ID")}` : null} />
              <DisplayField label="Maks Menit Denda" value={settings?.maxLatePenaltyMinutes?.toString()} />
            </div>
          </div>
        </div>

        {/* Quotation */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Quotation</h2>
          </div>
          <div className="p-4 px-5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Nama Tanda Tangan" value={settings?.quotationSignatureName} />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Footer Notes</span>
                <span className="text-[0.9375rem] text-foreground font-medium whitespace-pre-wrap">{settings?.quotationFooterNotes || "-"}</span>
              </div>
            </div>
            {settings?.quotationSignatureImage && (
              <div className="mt-3">
                <span className="text-xs font-medium text-muted uppercase tracking-wide">Gambar Tanda Tangan</span>
                <img src={settings.quotationSignatureImage} alt="Signature" className="mt-1 w-24 h-12 object-contain rounded border border-default" />
              </div>
            )}
          </div>
        </div>

        {/* Account Mapping */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Mapping Akun</h2>
          </div>
          <div className="p-4 px-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Penjualan</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Piutang Usaha" value={accountName(settings?.salesReceivableAccountId)} />
              <DisplayField label="Pendapatan Penjualan" value={accountName(settings?.salesRevenueAccountId)} />
              <DisplayField label="PPN Keluaran" value={accountName(settings?.salesTaxAccountId)} />
              <DisplayField label="Retur Penjualan" value={accountName(settings?.salesReturnAccountId)} />
              <DisplayField label="Akun Penjualan" value={accountName(settings?.salesAccountId)} />
            </div>

            <h3 className="text-sm font-semibold text-foreground mt-5 mb-3">Pembelian</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Hutang Usaha" value={accountName(settings?.purchasePayableAccountId)} />
              <DisplayField label="Persediaan" value={accountName(settings?.purchaseInventoryAccountId)} />
              <DisplayField label="PPN Masukan" value={accountName(settings?.purchaseTaxAccountId)} />
              <DisplayField label="Beban Pembelian" value={accountName(settings?.purchaseExpenseAccountId)} />
              <DisplayField label="Diskon Pembelian" value={accountName(settings?.purchaseDiscountAccountId)} />
              <DisplayField label="Ongkos Kirim" value={accountName(settings?.purchaseShippingAccountId)} />
              <DisplayField label="Retur Pembelian" value={accountName(settings?.purchaseReturnAccountId)} />
            </div>

            <h3 className="text-sm font-semibold text-foreground mt-5 mb-3">Persediaan & Manufaktur</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Persediaan" value={accountName(settings?.inventoryAccountId)} />
              <DisplayField label="Penyesuaian Persediaan" value={accountName(settings?.inventoryAdjustmentAccountId)} />
              <DisplayField label="Stock Adjustment" value={accountName(settings?.stockAdjustmentAccountId)} />
              <DisplayField label="HPP (COGS)" value={accountName(settings?.cogsAccountId)} />
              <DisplayField label="WIP" value={accountName(settings?.wipAccountId)} />
              <DisplayField label="Beban Material" value={accountName(settings?.materialExpenseAccountId)} />
              <DisplayField label="Beban Pengeluaran Material" value={accountName(settings?.materialIssueExpenseAccountId)} />
            </div>

            <h3 className="text-sm font-semibold text-foreground mt-5 mb-3">Umum</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Kas Kecil" value={accountName(settings?.pettyCashAccountId)} />
              <DisplayField label="Kas & Bank" value={accountName(settings?.cashBankAccountId)} />
              <DisplayField label="Beban Umum" value={accountName(settings?.generalExpenseAccountId)} />
              <DisplayField label="Kas Default" value={accountName(settings?.defaultCashAccountId)} />
            </div>

            <h3 className="text-sm font-semibold text-foreground mt-5 mb-3">Payroll</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Beban Gaji" value={accountName(settings?.salaryExpenseAccountId)} />
              <DisplayField label="Hutang Gaji" value={accountName(settings?.salariesPayableAccountId)} />
              <DisplayField label="Bank Payroll" value={accountName(settings?.payrollBankAccountId)} />
              <DisplayField label="Piutang Karyawan" value={accountName(settings?.employeeReceivableAccountId)} />
              <DisplayField label="Tipe Jurnal Payroll" value={accountName(settings?.payrollJournalTypeId)} />
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Pengaturan Lainnya</h2>
          </div>
          <div className="p-4 px-5">
            <div className="flex gap-3 flex-wrap">
              <Link href="/settings/users" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Users & Roles</Link>
              <Link href="/master/accounts" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Chart of Accounts</Link>
              <Link href="/master/warehouses" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Warehouses</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
