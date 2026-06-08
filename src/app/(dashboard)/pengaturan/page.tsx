export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SafeImage } from "@/components/ui/safe-image"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/shadcn/tabs"
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/shadcn/card"
import { Badge } from "@/components/ui/shadcn/badge"
import { Button } from "@/components/ui/shadcn/button"
import { Separator } from "@/components/ui/shadcn/separator"
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
  Shield,
  Activity,
  Pencil,
} from "lucide-react"

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || "-"}</span>
    </div>
  )
}

function BoolBadge({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Badge variant="outline" className={value
        ? "w-fit border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
        : "w-fit"
      }>
        {value ? "Aktif" : "Nonaktif"}
      </Badge>
    </div>
  )
}

function PrefixItem({ label, value, auto }: { label: string; value: string | null | undefined; auto?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold font-mono text-foreground">{value || "-"}</span>
      </div>
      {auto !== undefined && (
        <Badge variant="outline" className={auto
          ? "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
          : ""
        }>
          {auto ? "Auto" : "Manual"}
        </Badge>
      )}
    </div>
  )
}

function PrefixGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
        {children}
      </div>
    </div>
  )
}

function AccountCard({ label, value }: { label: string; value: string }) {
  const isSet = value !== "Belum diset"
  return (
    <div className={`rounded-lg border px-3 py-3 ${isSet ? "bg-card" : "border-destructive/30 bg-destructive/5"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-medium ${isSet ? "text-foreground" : "text-destructive"}`}>{value}</p>
    </div>
  )
}

function AccountSection({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  const mapped = items.filter((i) => i.value !== "Belum diset").length
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <Badge variant="outline">{mapped}/{items.length}</Badge>
      </div>
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {items.map((item) => (
          <AccountCard key={`${title}-${item.label}`} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  )
}

const quickLinks = [
  { href: "/pengaturan/pengguna", label: "Pengguna", desc: "Kelola akun pengguna sistem", icon: Users },
  { href: "/pengaturan/peran", label: "Peran & Hak Akses", desc: "Role-based access control", icon: Shield },
  { href: "/pengaturan/workflow", label: "Alur Persetujuan", desc: "Workflow approval dokumen", icon: Workflow },
  { href: "/pengaturan/log-aktivitas", label: "Log Aktivitas", desc: "Audit trail semua perubahan", icon: Activity },
  { href: "/pengaturan/cron", label: "Jadwal Tugas", desc: "Cron job otomatisasi", icon: Clock },
  { href: "/master/akun", label: "Chart of Accounts", desc: "Daftar akun pembukuan", icon: BookText },
  { href: "/master/gudang", label: "Gudang", desc: "Lokasi penyimpanan barang", icon: Warehouse },
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
      title: "Umum & Kas",
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

  const allMappings = mappingGroups.flatMap((g) => g.items)
  const mappedCount = allMappings.filter((i) => i.value !== "Belum diset").length
  const totalMappings = allMappings.length
  const unmappedCount = totalMappings - mappedCount
  const mappingProgress = totalMappings > 0 ? Math.round((mappedCount / totalMappings) * 100) : 0

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pengaturan" }]} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Pengaturan Sistem</h1>
          <p className="text-sm text-muted-foreground">Konfigurasi perusahaan, penomoran dokumen, dan pemetaan akun.</p>
        </div>
        <Button asChild>
          <Link href="/pengaturan/ubah">
            <Pencil className="size-4" /> Ubah Pengaturan
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="company" className="w-full">
        <TabsList variant="line" className="w-full flex-wrap justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="company"><Building2 className="size-4" /> Perusahaan</TabsTrigger>
          <TabsTrigger value="general"><SlidersHorizontal className="size-4" /> Umum</TabsTrigger>
          <TabsTrigger value="numbering"><Hash className="size-4" /> Penomoran</TabsTrigger>
          <TabsTrigger value="hr"><Clock className="size-4" /> SDM</TabsTrigger>
          <TabsTrigger value="quotation"><FileText className="size-4" /> Penawaran</TabsTrigger>
          <TabsTrigger value="accounts"><Wallet className="size-4" /> Mapping Akun</TabsTrigger>
          <TabsTrigger value="others"><LayoutGrid className="size-4" /> Lainnya</TabsTrigger>
        </TabsList>

        {/* Perusahaan */}
        <TabsContent value="company" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Informasi Perusahaan</CardTitle>
              <CardDescription>Identitas dan alamat resmi untuk dokumen dan faktur.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Nama Perusahaan" value={settings?.companyName} />
                <Field label="Email" value={settings?.companyEmail} />
                <Field label="Telepon" value={settings?.companyPhone} />
                <Field label="Website" value={settings?.companyWebsite} />
                <Field label="NPWP" value={settings?.companyTaxId} />
                <Field label="Provinsi" value={settings?.companyProvince} />
                <Field label="Kota" value={settings?.companyCity} />
                <Field label="Kecamatan" value={settings?.companyDistrict} />
                <Field label="Kelurahan" value={settings?.companyVillage} />
                <Field label="Kode Pos" value={settings?.companyPostalCode} />
              </div>
              {settings?.companyAddress && (
                <>
                  <Separator />
                  <Field label="Alamat Lengkap" value={settings.companyAddress} />
                </>
              )}
              {settings?.companyLogo && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">Logo</span>
                    <SafeImage src={settings.companyLogo} alt="Logo" width={80} height={80} className="size-20 rounded-lg border object-contain p-1" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Umum */}
        <TabsContent value="general" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pengaturan Umum</CardTitle>
              <CardDescription>Mata uang, periode fiskal, dan preferensi tampilan.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Metode Costing" value={settings?.costingMethod} />
                <Field label="Awal Tahun Fiskal" value={`Bulan ${settings?.fiscalYearStartMonth || 1}`} />
                <Field label="Kode Mata Uang" value={settings?.currencyCode} />
                <Field label="Simbol Mata Uang" value={settings?.currencySymbol} />
                <Field label="Locale" value={settings?.currencyLocale} />
                <Field label="Tanggal Kunci Periode" value={settings?.periodLockDate ? settings.periodLockDate.toISOString().split("T")[0] : null} />
                <BoolBadge label="Tampilkan Is Active" value={settings?.showIsActiveField !== false} />
                <BoolBadge label="Tampilkan NPWP" value={settings?.showTaxId !== false} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Penomoran */}
        <TabsContent value="numbering" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Penomoran Otomatis</CardTitle>
              <CardDescription>Prefix dan format kode dokumen yang dihasilkan sistem.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <PrefixGroup title="Kode Master">
                <PrefixItem label="Barang" value={settings?.itemCodePrefix} auto={settings?.enableAutoItemCode !== false} />
                <PrefixItem label="Gudang" value={settings?.warehouseCodePrefix} auto={settings?.enableAutoWarehouseCode !== false} />
                <PrefixItem label="Rak" value={settings?.rackCodePrefix} auto={settings?.enableAutoRackCode !== false} />
                <PrefixItem label="Baris" value={settings?.rowCodePrefix} auto={settings?.enableAutoRowCode !== false} />
                <PrefixItem label="Pelanggan" value={settings?.customerCodePrefix} auto={settings?.enableAutoCustomerCode !== false} />
                <PrefixItem label="Karyawan" value={settings?.employeeCodePrefix} auto={settings?.enableAutoEmployeeCode !== false} />
                <PrefixItem label="Pemasok" value={settings?.vendorCodePrefix} auto={settings?.enableAutoVendorCode !== false} />
              </PrefixGroup>
              <Separator />
              <PrefixGroup title="Dokumen Penjualan">
                <PrefixItem label="Penawaran" value={settings?.quotationCodePrefix} />
                <PrefixItem label="Pesanan Penjualan" value={settings?.salesOrderPrefix} />
                <PrefixItem label="Faktur" value={settings?.salesInvoicePrefix} />
                <PrefixItem label="Pembayaran" value={settings?.salesPaymentPrefix} />
                <PrefixItem label="Uang Muka" value={settings?.downPaymentPrefix} />
                <PrefixItem label="Surat Jalan" value={settings?.deliveryOrderPrefix} />
                <PrefixItem label="Retur" value={settings?.salesReturnPrefix} />
              </PrefixGroup>
              <Separator />
              <PrefixGroup title="Dokumen Pembelian">
                <PrefixItem label="Permintaan" value={settings?.purchaseRequestPrefix} />
                <PrefixItem label="Pesanan" value={settings?.purchaseOrderPrefix} />
                <PrefixItem label="Penerimaan" value={settings?.goodsReceiptPrefix} />
                <PrefixItem label="Tagihan" value={settings?.vendorBillPrefix} />
                <PrefixItem label="Pembayaran" value={settings?.vendorPaymentPrefix} />
                <PrefixItem label="Retur" value={settings?.purchaseReturnPrefix} />
              </PrefixGroup>
              <Separator />
              <PrefixGroup title="Inventaris & Manufaktur">
                <PrefixItem label="Aset" value={settings?.assetPrefix} />
                <PrefixItem label="Transfer" value={settings?.inventoryTransferPrefix} />
                <PrefixItem label="Penyesuaian" value={settings?.stockAdjustmentPrefix} />
                <PrefixItem label="Pengeluaran Material" value={settings?.materialIssuePrefix} />
                <PrefixItem label="Perintah Kerja" value={settings?.workOrderPrefix} />
                <PrefixItem label="Perintah Produksi" value={settings?.manufacturingOrderPrefix} />
              </PrefixGroup>
              <Separator />
              <PrefixGroup title="Keuangan & SDM">
                <PrefixItem label="Jurnal" value={settings?.journalPrefix} />
                <PrefixItem label="Pengeluaran" value={settings?.expensePrefix} />
                <PrefixItem label="Kas Kecil" value={settings?.pettyCashPrefix} />
                <PrefixItem label="Rekonsiliasi" value={settings?.reconciliationPrefix} />
                <PrefixItem label="Penggajian" value={settings?.payrollPrefix} />
                <PrefixItem label="Lembar Waktu" value={settings?.timesheetPrefix} />
                <PrefixItem label="Proyek" value={settings?.projectPrefix} />
                <PrefixItem label="Tiket" value={settings?.ticketPrefix} />
                <PrefixItem label="Prospek" value={settings?.leadPrefix} />
              </PrefixGroup>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SDM */}
        <TabsContent value="hr" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Lembur & Kehadiran</CardTitle>
              <CardDescription>Parameter perhitungan lembur dan aturan presensi.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Pengali Lembur" value={settings?.overtimeMultiplier ? Number(settings.overtimeMultiplier).toString() : null} />
                <Field label="Koefisien Lembur" value={settings?.overtimeCoefficient ? Number(settings.overtimeCoefficient).toString() : null} />
                <Field label="Istirahat Lembur Mulai" value={settings?.overtimeMealBreakStart} />
                <Field label="Istirahat Lembur Selesai" value={settings?.overtimeMealBreakEnd} />
                <Field label="ISOMA Mulai" value={settings?.restBreakStart} />
                <Field label="ISOMA Selesai" value={settings?.restBreakEnd} />
                <Field label="Radius Kehadiran (KM)" value={settings?.attendanceRadiusKm ? Number(settings.attendanceRadiusKm).toString() : null} />
                <Field label="Denda Terlambat/Menit" value={settings?.latePenaltyPerMinute ? `Rp ${Number(settings.latePenaltyPerMinute).toLocaleString("id-ID")}` : null} />
                <Field label="Maks Menit Denda" value={settings?.maxLatePenaltyMinutes?.toString()} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Penawaran */}
        <TabsContent value="quotation" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pengaturan Penawaran</CardTitle>
              <CardDescription>Tanda tangan dan catatan kaki pada dokumen penawaran.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nama Tanda Tangan" value={settings?.quotationSignatureName} />
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Catatan Footer</span>
                  <p className="text-sm font-medium text-foreground whitespace-pre-wrap">{settings?.quotationFooterNotes || "-"}</p>
                </div>
              </div>
              {settings?.quotationSignatureImage && (
                <>
                  <Separator className="my-4" />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">Gambar Tanda Tangan</span>
                    <SafeImage src={settings.quotationSignatureImage} alt="Tanda Tangan" width={120} height={60} className="w-28 h-14 rounded-lg border object-contain p-1" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mapping Akun */}
        <TabsContent value="accounts" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Mapping Akun</CardTitle>
              <CardDescription>Pemetaan akun buku besar untuk posting jurnal otomatis.</CardDescription>
              <CardAction>
                <Button asChild variant="outline" size="sm">
                  <Link href="/pengaturan/ubah">Ubah Mapping</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Progress bar */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {unmappedCount === 0 ? (
                      <CheckCircle2 className="size-5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="size-5 text-amber-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {unmappedCount === 0 ? "Semua akun tersambung" : `${unmappedCount} akun belum diset`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {mappedCount} dari {totalMappings} akun sudah terpetakan
                      </p>
                    </div>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-foreground">{mappingProgress}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${unmappedCount === 0 ? "bg-emerald-500" : "bg-primary"}`}
                    style={{ width: `${mappingProgress}%` }}
                  />
                </div>
              </div>

              {mappingGroups.map((group) => (
                <AccountSection key={group.title} title={group.title} items={group.items} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lainnya */}
        <TabsContent value="others" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Modul Konfigurasi</CardTitle>
              <CardDescription>Pengaturan terkait yang dikelola di halaman terpisah.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {quickLinks.map((link) => {
                  const Icon = link.icon
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{link.label}</p>
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
