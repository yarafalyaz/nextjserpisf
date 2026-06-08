export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/shadcn/button"
import { Badge } from "@/components/ui/shadcn/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/shadcn/card"
import { Separator } from "@/components/ui/shadcn/separator"
import { Pencil } from "lucide-react"

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

export default async function NumberingPage() {
  await requirePermission("manage_settings")
  const settings = await prisma.systemSetting.findFirst()

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pengaturan", href: "/pengaturan" }, { label: "Penomoran Dokumen" }]} />

      <Card>
        <CardHeader>
          <CardTitle>Penomoran Otomatis</CardTitle>
          <CardDescription>Prefix dan format kode dokumen yang dihasilkan sistem.</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/pengaturan/ubah"><Pencil className="size-3.5" /> Ubah</Link>
            </Button>
          </CardAction>
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
    </div>
  )
}
