export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SafeImage } from "@/components/ui/safe-image"

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

function AccountMappingField({ label, value }: { label: string; value: string }) {
  const isSet = value !== "Belum diset"

  return (
    <div className={`rounded-lg border px-3 py-3 transition-colors ${
      isSet ? "bg-surface border-default" : "bg-danger/5 border-danger/30"
    }`}>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`mt-1 text-[1rem] font-semibold leading-snug ${isSet ? "text-foreground" : "text-danger"}`}>{value}</p>
      <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
        isSet ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      }`}>
        {isSet ? "Tersambung" : "Belum Diset"}
      </span>
    </div>
  )
}

function AccountMappingSection({
  title,
  items,
}: {
  title: string
  items: { label: string; value: string }[]
}) {
  const mapped = items.filter((item) => item.value !== "Belum diset").length

  return (
    <section className="rounded-xl border border-default bg-surface-secondary/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <span className="inline-flex rounded-full border border-default bg-surface px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
          {mapped}/{items.length} Tersambung
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {items.map((item) => (
          <AccountMappingField key={`${title}-${item.label}`} label={item.label} value={item.value} />
        ))}
      </div>
    </section>
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

  const mappingGroups = [
    {
      title: "Penjualan",
      items: [
        { label: "Piutang Usaha", value: accountName(settings?.salesReceivableAccountId) },
        { label: "Pendapatan Penjualan", value: accountName(settings?.salesRevenueAccountId) },
        { label: "PPN Keluaran", value: accountName(settings?.salesTaxAccountId) },
        { label: "Retur Penjualan", value: accountName(settings?.salesReturnAccountId) },
        { label: "Akun Penjualan", value: accountName(settings?.salesAccountId) },
      ],
    },
    {
      title: "Pembelian",
      items: [
        { label: "Hutang Usaha", value: accountName(settings?.purchasePayableAccountId) },
        { label: "Persediaan", value: accountName(settings?.purchaseInventoryAccountId) },
        { label: "PPN Masukan", value: accountName(settings?.purchaseTaxAccountId) },
        { label: "Beban Pembelian", value: accountName(settings?.purchaseExpenseAccountId) },
        { label: "Diskon Pembelian", value: accountName(settings?.purchaseDiscountAccountId) },
        { label: "Ongkos Kirim", value: accountName(settings?.purchaseShippingAccountId) },
        { label: "Retur Pembelian", value: accountName(settings?.purchaseReturnAccountId) },
      ],
    },
    {
      title: "Persediaan & Manufaktur",
      items: [
        { label: "Persediaan", value: accountName(settings?.inventoryAccountId) },
        { label: "Penyesuaian Persediaan", value: accountName(settings?.inventoryAdjustmentAccountId) },
        { label: "Stock Adjustment", value: accountName(settings?.stockAdjustmentAccountId) },
        { label: "HPP (COGS)", value: accountName(settings?.cogsAccountId) },
        { label: "WIP", value: accountName(settings?.wipAccountId) },
        { label: "Beban Material", value: accountName(settings?.materialExpenseAccountId) },
        { label: "Beban Pengeluaran Material", value: accountName(settings?.materialIssueExpenseAccountId) },
      ],
    },
    {
      title: "Umum",
      items: [
        { label: "Kas Kecil", value: accountName(settings?.pettyCashAccountId) },
        { label: "Kas & Bank", value: accountName(settings?.cashBankAccountId) },
        { label: "Beban Umum", value: accountName(settings?.generalExpenseAccountId) },
        { label: "Kas Default", value: accountName(settings?.defaultCashAccountId) },
      ],
    },
    {
      title: "Payroll",
      items: [
        { label: "Beban Gaji", value: accountName(settings?.salaryExpenseAccountId) },
        { label: "Hutang Gaji", value: accountName(settings?.salariesPayableAccountId) },
        { label: "Bank Payroll", value: accountName(settings?.payrollBankAccountId) },
        { label: "Piutang Karyawan", value: accountName(settings?.employeeReceivableAccountId) },
        { label: "Tipe Jurnal Payroll", value: accountName(settings?.payrollJournalTypeId) },
      ],
    },
  ]

  const allMappings = mappingGroups.flatMap((group) => group.items)
  const mappedCount = allMappings.filter((item) => item.value !== "Belum diset").length
  const totalMappings = allMappings.length
  const unmappedCount = totalMappings - mappedCount
  const mappingProgress = totalMappings > 0 ? Math.round((mappedCount / totalMappings) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Settings" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pengaturan Sistem</h1>
        <Link href="/pengaturan/ubah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-all">
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
                <SafeImage src={settings.companyLogo} alt="Logo" width={64} height={64} className="mt-1 w-16 h-16 object-contain rounded border border-default" />
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
              <DisplayField label="Barang" value={settings?.itemCodePrefix} />
              <BoolField label="Auto Item" value={settings?.enableAutoItemCode !== false} />
              <DisplayField label="Gudang" value={settings?.warehouseCodePrefix} />
              <BoolField label="Auto Gudang" value={settings?.enableAutoWarehouseCode !== false} />
              <DisplayField label="Rak" value={settings?.rackCodePrefix} />
              <BoolField label="Auto Rak" value={settings?.enableAutoRackCode !== false} />
              <DisplayField label="Baris" value={settings?.rowCodePrefix} />
              <BoolField label="Auto Baris" value={settings?.enableAutoRowCode !== false} />
              <DisplayField label="Pelanggan" value={settings?.customerCodePrefix} />
              <BoolField label="Auto Customer" value={settings?.enableAutoCustomerCode !== false} />
              <DisplayField label="Karyawan" value={settings?.employeeCodePrefix} />
              <BoolField label="Auto Karyawan" value={settings?.enableAutoEmployeeCode !== false} />
              <DisplayField label="Pemasok" value={settings?.vendorCodePrefix} />
              <BoolField label="Auto Vendor" value={settings?.enableAutoVendorCode !== false} />
            </div>
            <h3 className="text-sm font-semibold text-foreground mt-5 mb-3">Prefix Dokumen</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <DisplayField label="Penawaran" value={settings?.quotationCodePrefix} />
              <DisplayField label="Aset" value={settings?.assetPrefix} />
              <DisplayField label="Pesanan Penjualan" value={settings?.salesOrderPrefix} />
              <DisplayField label="Faktur" value={settings?.salesInvoicePrefix} />
              <DisplayField label="Pembayaran" value={settings?.salesPaymentPrefix} />
              <DisplayField label="Down Payment" value={settings?.downPaymentPrefix} />
              <DisplayField label="Delivery Order" value={settings?.deliveryOrderPrefix} />
              <DisplayField label="Sales Return" value={settings?.salesReturnPrefix} />
              <DisplayField label="Purchase Request" value={settings?.purchaseRequestPrefix} />
              <DisplayField label="Pesanan Pembelian" value={settings?.purchaseOrderPrefix} />
              <DisplayField label="Penerimaan Barang" value={settings?.goodsReceiptPrefix} />
              <DisplayField label="Vendor Bill" value={settings?.vendorBillPrefix} />
              <DisplayField label="Vendor Payment" value={settings?.vendorPaymentPrefix} />
              <DisplayField label="Purchase Return" value={settings?.purchaseReturnPrefix} />
              <DisplayField label="Transfer" value={settings?.inventoryTransferPrefix} />
              <DisplayField label="Penyesuaian" value={settings?.stockAdjustmentPrefix} />
              <DisplayField label="Material Issue" value={settings?.materialIssuePrefix} />
              <DisplayField label="Stock Movement" value={settings?.stockMovementPrefix} />
              <DisplayField label="Work Order" value={settings?.workOrderPrefix} />
              <DisplayField label="Manufacturing Order" value={settings?.manufacturingOrderPrefix} />
              <DisplayField label="Jurnal" value={settings?.journalPrefix} />
              <DisplayField label="Pengeluaran" value={settings?.expensePrefix} />
              <DisplayField label="Petty Cash" value={settings?.pettyCashPrefix} />
              <DisplayField label="Rekonsiliasi" value={settings?.reconciliationPrefix} />
              <DisplayField label="Penggajian" value={settings?.payrollPrefix} />
              <DisplayField label="Proyek" value={settings?.projectPrefix} />
              <DisplayField label="Ticket" value={settings?.ticketPrefix} />
              <DisplayField label="Lead" value={settings?.leadPrefix} />
              <DisplayField label="Lembar Waktu" value={settings?.timesheetPrefix} />
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
                <SafeImage src={settings.quotationSignatureImage} alt="Tanda Tangan" width={96} height={48} className="mt-1 w-24 h-12 object-contain rounded border border-default" />
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
            <div className="rounded-xl border border-default bg-surface-secondary/50 p-4 mb-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted">Kualitas Mapping</p>
                  <p className="text-lg font-semibold text-foreground mt-1">
                    {mappedCount}/{totalMappings} akun tersambung
                  </p>
                  <p className="text-sm text-muted mt-1">
                    {unmappedCount === 0
                      ? "Semua mapping akun sudah lengkap."
                      : `${unmappedCount} akun belum diset. Lengkapi untuk posting jurnal yang lebih aman.`}
                  </p>
                </div>
                <Link
                  href="/pengaturan/ubah"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all"
                >
                  Edit Mapping
                </Link>
              </div>
              <div className="mt-3 h-2 rounded-full bg-surface border border-default overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${mappingProgress}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              {mappingGroups.map((group) => (
                <AccountMappingSection key={group.title} title={group.title} items={group.items} />
              ))}
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
              <Link href="/pengaturan/pengguna" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Pengguna & Peran</Link>
              <Link href="/master/akun" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Chart of Accounts</Link>
              <Link href="/master/gudang" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Gudang</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
