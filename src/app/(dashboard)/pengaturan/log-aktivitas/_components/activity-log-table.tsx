"use client"

import type { ErpColumnDef as ColumnDef } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/shadcn/badge"

import { Button } from "@/components/ui/button"
import { useState } from "react"
import { Download, Eye } from "lucide-react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Combobox } from "@/components/ui/combobox"
import { DetailDrawer } from "@/components/activity-log/detail-drawer"

interface LogRow {
  id: number
  userId: number | null
  userName: string
  action: string
  modelType: string
  modelId: number | null
  description: string
  createdAt: string
  ipAddress: string
  oldValues?: unknown
  newValues?: unknown
}

const actionBadge: Record<string, string> = {
  create: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  CREATE: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  update: "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  UPDATE: "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  delete: "border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  DELETE: "border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  login: "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  LOGIN: "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  grant: "border-transparent bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  revoke: "border-transparent bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  initialize: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
}

const actionLabel: Record<string, string> = {
  create: "Buat",
  CREATE: "Buat",
  update: "Ubah",
  UPDATE: "Ubah",
  delete: "Hapus",
  DELETE: "Hapus",
  login: "Login",
  LOGIN: "Login",
  grant: "Izinkan",
  revoke: "Cabut",
  initialize: "Inisialisasi",
}

const modelLabel: Record<string, string> = {
  VehicleVariant: "Varian Kendaraan",
  VehicleModel: "Model Kendaraan",
  VehicleBrand: "Merek Kendaraan",
  Vehicle: "Kendaraan",
  Customer: "Pelanggan",
  Supplier: "Vendor",
  Item: "Barang",
  ItemCategory: "Kategori Barang",
  Brand: "Merek",
  Warehouse: "Gudang",
  Employee: "Karyawan",
  Department: "Departemen",
  Position: "Jabatan",
  Account: "Akun",
  Bank: "Bank",
  Tax: "Pajak",
  TaxGroup: "Grup Pajak",
  Currency: "Mata Uang",
  PaymentTerm: "Termin Pembayaran",
  PaymentMethod: "Metode Pembayaran",
  ShippingMethod: "Metode Pengiriman",
  Unit: "Satuan",
  SalesQuotation: "Penawaran",
  SalesOrder: "Pesanan Penjualan",
  SalesInvoice: "Faktur Penjualan",
  SalesPayment: "Pembayaran Penjualan",
  SalesReturn: "Retur Penjualan",
  DeliveryNote: "Surat Jalan",
  PurchaseRequest: "Permintaan Pembelian",
  PurchaseOrder: "Pesanan Pembelian",
  GoodsReceipt: "Penerimaan Barang",
  VendorBill: "Tagihan Vendor",
  VendorPayment: "Pembayaran Vendor",
  PurchaseReturn: "Retur Pembelian",
  Project: "Proyek",
  ProjectStage: "Tahap Proyek",
  StockAdjustment: "Penyesuaian Stok",
  StockTransfer: "Transfer Stok",
  MaterialIssue: "Pengeluaran Material",
  Journal: "Jurnal",
  Expense: "Biaya",
  PettyCash: "Kas Kecil",
  Budget: "Anggaran",
  CostCenter: "Pusat Biaya",
  Asset: "Aset",
  AssetCategory: "Kategori Aset",
  AssetBrand: "Merek Aset",
  Role: "Peran",
  User: "Pengguna",
  SystemSetting: "Pengaturan",
  Lead: "Prospek",
  Ticket: "Tiket",
  Attendance: "Absensi",
  Leave: "Cuti",
  Overtime: "Lembur",
  Payroll: "Penggajian",
  Loan: "Pinjaman",
  ProductionOrder: "Perintah Produksi",
  WorkOrder: "Perintah Kerja",
  BOM: "BOM Produk",
}

interface ActivityLogTableProps {
  data: LogRow[]
  total: number
  page: number
  pageSize: number
  users: { id: number; name: string }[]
  modelTypes: string[]
  actions: string[]
  filterUser: string
  filterAction: string
  filterModel: string
  filterDateFrom: string
  filterDateTo: string
  onFilterChange: (key: string, value: string) => void
}

export function ActivityLogTable({
  data,
  total,
  page,
  pageSize,
  users,
  modelTypes,
  actions: actionList,
  filterUser,
  filterAction,
  filterModel,
  filterDateFrom,
  filterDateTo,
  onFilterChange,
}: ActivityLogTableProps) {
  const [detailRow, setDetailRow] = useState<LogRow | null>(null)

  function buildExportUrl() {
    const params = new URLSearchParams()
    if (filterUser !== "all") params.set("userId", filterUser)
    if (filterAction !== "all") params.set("action", filterAction)
    if (filterModel !== "all") params.set("modelType", filterModel)
    if (filterDateFrom) params.set("dateFrom", filterDateFrom)
    if (filterDateTo) params.set("dateTo", filterDateTo)
    return `/api/activity-logs/export?${params.toString()}`
  }

  const columns: ColumnDef<LogRow, unknown>[] = [
    {
      accessorKey: "createdAt",
      header: "Waktu",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs tabular-nums">
          {row.original.createdAt}
        </span>
      ),
    },
    {
      accessorKey: "userName",
      header: "Pengguna",
      cell: ({ row }) => (
        <span className="max-w-[140px] truncate">{row.original.userName}</span>
      ),
    },
    {
      accessorKey: "action",
      header: "Aksi",
      cell: ({ row }) => (
        <Badge variant="outline" className={actionBadge[row.original.action] || ""}>
          {actionLabel[row.original.action] || row.original.action}
        </Badge>
      ),
    },
    {
      accessorKey: "modelType",
      header: "Model",
      cell: ({ row }) => (
        <span className="text-xs">{modelLabel[row.original.modelType] || row.original.modelType}</span>
      ),
    },
    {
      accessorKey: "modelId",
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.modelId ? `#${row.original.modelId}` : "-"}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: "Deskripsi",
      cell: ({ row }) => (
        <span className="max-w-[280px] truncate text-muted-foreground">
          {row.original.description}
        </span>
      ),
    },
    {
      accessorKey: "ipAddress",
      header: "IP",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.ipAddress}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const hasChanges =
          row.original.oldValues != null || row.original.newValues != null
        return hasChanges ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setDetailRow(row.original)}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        ) : null
      },
    },
  ]

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Date range */}
        <div className="flex items-center gap-1">
          <AppDatePicker
            name="dateFrom"
            value={filterDateFrom}
            onChange={(v) => onFilterChange("dateFrom", v)}
            placeholder="Dari tanggal"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <AppDatePicker
            name="dateTo"
            value={filterDateTo}
            onChange={(v) => onFilterChange("dateTo", v)}
            placeholder="Sampai tanggal"
          />
        </div>

        {/* User filter */}
        <Combobox
          options={[
            { value: "all", label: "Semua pengguna" },
            ...users.map((u) => ({ value: String(u.id), label: u.name })),
          ]}
          value={filterUser}
          onChange={(v) => onFilterChange("userId", v ?? "all")}
          placeholder="Semua pengguna"
        />

        {/* Action filter */}
        <Combobox
          options={[
            { value: "all", label: "Semua aksi" },
            ...actionList.map((a) => ({ value: a, label: actionLabel[a] || a })),
          ]}
          value={filterAction}
          onChange={(v) => onFilterChange("action", v ?? "all")}
          placeholder="Semua aksi"
        />

        {/* Model filter */}
        <Combobox
          options={[
            { value: "all", label: "Semua model" },
            ...modelTypes.map((m) => ({ value: m, label: modelLabel[m] || m })),
          ]}
          value={filterModel}
          onChange={(v) => onFilterChange("modelType", v ?? "all")}
          placeholder="Semua model"
        />

        {/* Export */}
        <a
          href={buildExportUrl()}
          download
          className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </a>
      </div>

      <DataTable
        data={data}
        columns={columns}
        searchColumn="description"
        searchPlaceholder="Cari deskripsi..."
        selectable={false}
        pageSize={pageSize}
        serverPagination={{ total, page, pageSize }}
      />

      <DetailDrawer
        open={detailRow !== null}
        onClose={() => setDetailRow(null)}
        row={detailRow}
      />
    </>
  )
}
