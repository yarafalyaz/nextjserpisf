export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SafeImage } from "@/components/ui/safe-image"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/shadcn/tabs"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/shadcn/card"
import {
  Building2,
  SlidersHorizontal,
  Hash,
  Clock,
  FileText,
  Wallet,
  LayoutGrid,
  Users,
  Workflow,
  BookText,
  Warehouse,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/shadcn/alert"

function DisplayField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-[0.9375rem] text-foreground font-medium">{value || "-"}</span>
    </div>
  )
}

function BoolField({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${value ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
        {value ? "Aktif" : "Nonaktif"}
      </span>
    </div>
  )
}

function PrefixField({ label, value, auto }: { label: string; value: string | null | undefined; auto?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-default bg-surface px-3 py-2.5">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
        <span className="text-sm font-semibold text-foreground font-mono">{value || "-"}</span>
      </div>
      {auto !== undefined && (
        <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${auto ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
          {auto ? "Auto" : "Manual"}
        </span>
      )}
    </div>
  )
}

function PrefixGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-default bg-surface-secondary/40 p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
        {children}
      </div>
    </div>
  )
}

function AccountMappingField({ label, value }: { label: string; value: string }) {
  const isSet = value !== "Belum diset"

  return (
    <div className={`rounded-lg border px-3 py-3 transition-colors ${
      isSet ? "bg-surface border-default" : "bg-danger/5 border-danger/30"
    }`}>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
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
        <span className="inline-flex rounded-full border border-default bg-surface px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
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

const quickLinks = [
  { href: "/pengaturan/pengguna", label: "Pengguna & Peran", desc: "Kelola akun pengguna dan hak akses peran", icon: Users },
  { href: "/pengaturan/workflow", label: "Alur Persetujuan", desc: "Atur workflow approval antar dokumen", icon: Workflow },
  { href: "/master/akun", label: "Chart of Accounts", desc: "Daftar akun (CoA) untuk pembukuan", icon: BookText },
  { href: "/master/gudang", label: "Gudang", desc: "Kelola lokasi gudang penyimpanan", icon: Warehouse },
]

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
        { label: "Penyesuaian Stok", value: accountName(settings?.stockAdjustmentAccountId) },
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
      title: "Penggajian",
      items: [
        { label: "Beban Gaji", value: accountName(settings?.salaryExpenseAccountId) },
        { label: "Hutang Gaji", value: accountName(settings?.salariesPayableAccountId) },
        { label: "Bank Penggajian", value: accountName(settings?.payrollBankAccountId) },
        { label: "Piutang Karyawan", value: accountName(settings?.employeeReceivableAccountId) },
        { label: "Tipe Jurnal Penggajian", value: accountName(settings?.payrollJournalTypeId) },
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
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pengaturan Sistem</h1>
          <p className="text-sm text-muted-foreground mt-1">Kelola konfigurasi perusahaan, penomoran dokumen, dan pemetaan akun.</p>
        </div>
        <Link href="/pengaturan/ubah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-all">
          Ubah Pengaturan
        </Link>
      </div>

      <Tabs defaultValue="company" className="w-full">
        <TabsList variant="line" className="w-full flex-wrap justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="company"><Building2 /> Perusahaan</TabsTrigger>
          <TabsTrigger value="general"><SlidersHorizontal /> Umum</TabsTrigger>
          <TabsTrigger value="numbering"><Hash /> Penomoran</TabsTrigger>
          <TabsTrigger value="hr"><Clock /> Lembur & Kehadiran</TabsTrigger>
          <TabsTrigger value="quotation"><FileText /> Penawaran</TabsTrigger>
          <TabsTrigger value="accounts"><Wallet /> Mapping Akun</TabsTrigger>
          <TabsTrigger value="others"><LayoutGrid /> Lainnya</TabsTrigger>
        </TabsList>

        {/* Tab: Perusahaan */}
        <TabsContent value="company" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Informasi Perusahaan</CardTitle>
              <CardDescription>Identitas dan alamat resmi perusahaan untuk dokumen dan faktur.</CardDescription>
            </CardHeader>
            <CardContent>
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
                <div className="mt-4">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Alamat</span>
                  <p className="text-[0.9375rem] text-foreground font-medium mt-1">{settings.companyAddress}</p>
                </div>
              )}
              {settings?.companyLogo && (
                <div className="mt-4">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Logo</span>
                  <SafeImage src={settings.companyLogo} alt="Logo" width={64} height={64} className="mt-1 w-16 h-16 object-contain rounded border border-default" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Umum */}
        <TabsContent value="general" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pengaturan Umum</CardTitle>
              <CardDescription>Mata uang, periode fiskal, dan preferensi tampilan global.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                <DisplayField label="Metode Costing" value={settings?.costingMethod} />
                <DisplayField label="Awal Tahun Fiskal" value={`Bulan ${settings?.fiscalYearStartMonth || 1}`} />
                <DisplayField label="Kode Mata Uang" value={settings?.currencyCode} />
                <DisplayField label="Simbol Mata Uang" value={settings?.currencySymbol} />
                <DisplayField label="Locale" value={settings?.currencyLocale} />
                <DisplayField label="Format Nomor Dokumen (legacy)" value={settings?.documentNumberFormat} />
                <DisplayField label="Tanggal Kunci Periode" value={settings?.periodLockDate ? settings.periodLockDate.toISOString().split("T")[0] : null} />
                <BoolField label="Tampilkan Is Active" value={settings?.showIsActiveField !== false} />
                <BoolField label="Tampilkan NPWP" value={settings?.showTaxId !== false} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Penomoran */}
        <TabsContent value="numbering" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Penomoran Otomatis</CardTitle>
              <CardDescription>Prefix kode master dan dokumen yang dihasilkan otomatis oleh sistem.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PrefixGroup title="Kode Master">
                <PrefixField label="Barang" value={settings?.itemCodePrefix} auto={settings?.enableAutoItemCode !== false} />
                <PrefixField label="Gudang" value={settings?.warehouseCodePrefix} auto={settings?.enableAutoWarehouseCode !== false} />
                <PrefixField label="Rak" value={settings?.rackCodePrefix} auto={settings?.enableAutoRackCode !== false} />
                <PrefixField label="Baris" value={settings?.rowCodePrefix} auto={settings?.enableAutoRowCode !== false} />
                <PrefixField label="Pelanggan" value={settings?.customerCodePrefix} auto={settings?.enableAutoCustomerCode !== false} />
                <PrefixField label="Karyawan" value={settings?.employeeCodePrefix} auto={settings?.enableAutoEmployeeCode !== false} />
                <PrefixField label="Pemasok" value={settings?.vendorCodePrefix} auto={settings?.enableAutoVendorCode !== false} />
              </PrefixGroup>

              <PrefixGroup title="Dokumen Penjualan">
                <PrefixField label="Penawaran" value={settings?.quotationCodePrefix} />
                <PrefixField label="Pesanan Penjualan" value={settings?.salesOrderPrefix} />
                <PrefixField label="Faktur" value={settings?.salesInvoicePrefix} />
                <PrefixField label="Pembayaran" value={settings?.salesPaymentPrefix} />
                <PrefixField label="Uang Muka" value={settings?.downPaymentPrefix} />
                <PrefixField label="Surat Jalan" value={settings?.deliveryOrderPrefix} />
                <PrefixField label="Retur Penjualan" value={settings?.salesReturnPrefix} />
              </PrefixGroup>

              <PrefixGroup title="Dokumen Pembelian">
                <PrefixField label="Permintaan Pembelian" value={settings?.purchaseRequestPrefix} />
                <PrefixField label="Pesanan Pembelian" value={settings?.purchaseOrderPrefix} />
                <PrefixField label="Penerimaan Barang" value={settings?.goodsReceiptPrefix} />
                <PrefixField label="Tagihan Pemasok" value={settings?.vendorBillPrefix} />
                <PrefixField label="Pembayaran Pemasok" value={settings?.vendorPaymentPrefix} />
                <PrefixField label="Retur Pembelian" value={settings?.purchaseReturnPrefix} />
              </PrefixGroup>

              <PrefixGroup title="Inventaris & Manufaktur">
                <PrefixField label="Aset" value={settings?.assetPrefix} />
                <PrefixField label="Transfer" value={settings?.inventoryTransferPrefix} />
                <PrefixField label="Penyesuaian" value={settings?.stockAdjustmentPrefix} />
                <PrefixField label="Pengeluaran Material" value={settings?.materialIssuePrefix} />
                <PrefixField label="Pergerakan Stok" value={settings?.stockMovementPrefix} />
                <PrefixField label="Perintah Kerja" value={settings?.workOrderPrefix} />
                <PrefixField label="Perintah Produksi" value={settings?.manufacturingOrderPrefix} />
              </PrefixGroup>

              <PrefixGroup title="Keuangan">
                <PrefixField label="Jurnal" value={settings?.journalPrefix} />
                <PrefixField label="Pengeluaran" value={settings?.expensePrefix} />
                <PrefixField label="Kas Kecil" value={settings?.pettyCashPrefix} />
                <PrefixField label="Rekonsiliasi" value={settings?.reconciliationPrefix} />
              </PrefixGroup>

              <PrefixGroup title="SDM, Proyek & CRM">
                <PrefixField label="Penggajian" value={settings?.payrollPrefix} />
                <PrefixField label="Lembar Waktu" value={settings?.timesheetPrefix} />
                <PrefixField label="Proyek" value={settings?.projectPrefix} />
                <PrefixField label="Tiket" value={settings?.ticketPrefix} />
                <PrefixField label="Prospek" value={settings?.leadPrefix} />
              </PrefixGroup>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Lembur & Kehadiran */}
        <TabsContent value="hr" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Lembur & Kehadiran</CardTitle>
              <CardDescription>Parameter perhitungan lembur dan aturan presensi karyawan.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                <DisplayField label="Pengali Lembur" value={settings?.overtimeMultiplier ? Number(settings.overtimeMultiplier).toString() : null} />
                <DisplayField label="Koefisien Lembur" value={settings?.overtimeCoefficient ? Number(settings.overtimeCoefficient).toString() : null} />
                <DisplayField label="Istirahat Lembur Mulai" value={settings?.overtimeMealBreakStart} />
                <DisplayField label="Istirahat Lembur Selesai" value={settings?.overtimeMealBreakEnd} />
                <DisplayField label="ISOMA Mulai (Istirahat Kerja)" value={settings?.restBreakStart} />
                <DisplayField label="ISOMA Selesai (Istirahat Kerja)" value={settings?.restBreakEnd} />
                <DisplayField label="Radius Kehadiran (KM)" value={settings?.attendanceRadiusKm ? Number(settings.attendanceRadiusKm).toString() : null} />
                <DisplayField label="Denda Terlambat/Menit" value={settings?.latePenaltyPerMinute ? `Rp ${Number(settings.latePenaltyPerMinute).toLocaleString("id-ID")}` : null} />
                <DisplayField label="Maks Menit Denda" value={settings?.maxLatePenaltyMinutes?.toString()} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Penawaran */}
        <TabsContent value="quotation" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Penawaran</CardTitle>
              <CardDescription>Tanda tangan dan catatan kaki yang tampil pada dokumen penawaran.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                <DisplayField label="Nama Tanda Tangan" value={settings?.quotationSignatureName} />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Catatan Footer</span>
                  <span className="text-[0.9375rem] text-foreground font-medium whitespace-pre-wrap">{settings?.quotationFooterNotes || "-"}</span>
                </div>
              </div>
              {settings?.quotationSignatureImage && (
                <div className="mt-4">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gambar Tanda Tangan</span>
                  <SafeImage src={settings.quotationSignatureImage} alt="Tanda Tangan" width={96} height={48} className="mt-1 w-24 h-12 object-contain rounded border border-default" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Mapping Akun */}
        <TabsContent value="accounts" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Mapping Akun</CardTitle>
              <CardDescription>Pemetaan akun buku besar untuk posting jurnal otomatis.</CardDescription>
            </CardHeader>
            <CardContent>
              {unmappedCount === 0 ? (
                <Alert variant="success" className="mb-4">
                  <CheckCircle2 />
                  <AlertTitle>Mapping akun lengkap</AlertTitle>
                  <AlertDescription>
                    Semua {totalMappings} akun sudah tersambung. Posting jurnal otomatis siap digunakan.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="warning" className="mb-4">
                  <AlertTriangle />
                  <AlertTitle>{unmappedCount} akun belum diset</AlertTitle>
                  <AlertDescription>
                    Lengkapi pemetaan akun agar posting jurnal otomatis berjalan aman dan akurat.
                  </AlertDescription>
                </Alert>
              )}
              <div className="rounded-xl border border-default bg-surface-secondary/50 p-4 mb-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Kualitas Mapping</p>
                    <p className="text-lg font-semibold text-foreground mt-1">
                      {mappedCount}/{totalMappings} akun tersambung
                    </p>
                  </div>
                  <Link
                    href="/pengaturan/ubah"
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all"
                  >
                    Ubah Mapping
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Lainnya */}
        <TabsContent value="others" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pengaturan Lainnya</CardTitle>
              <CardDescription>Modul konfigurasi terkait yang dikelola di halaman terpisah.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
                {quickLinks.map((link) => {
                  const Icon = link.icon
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="group flex items-center gap-3 rounded-xl border border-default bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-surface-secondary/60"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{link.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{link.desc}</p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
