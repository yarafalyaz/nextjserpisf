"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/shadcn/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select"
import { useState } from "react"

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
}

const modelLabel: Record<string, string> = {
  VehicleVariant: "Varian Kendaraan",
  VehicleModel: "Model Kendaraan",
  VehicleBrand: "Merek Kendaraan",
  Vehicle: "Kendaraan",
  Customer: "Pelanggan",
  Supplier: "Pemasok",
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

const columns: ColumnDef<LogRow, unknown>[] = [
  {
    accessorKey: "createdAt",
    header: "Waktu",
    cell: ({ row }) => {
      const d = new Date(row.original.createdAt)
      return (
        <span className="whitespace-nowrap text-xs tabular-nums">
          {d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}{" "}
          {d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )
    },
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
    filterFn: "equals",
  },
  {
    accessorKey: "modelType",
    header: "Model",
    cell: ({ row }) => (
      <span className="text-xs">{modelLabel[row.original.modelType] || row.original.modelType}</span>
    ),
    filterFn: "equals",
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
]

interface ActivityLogTableProps {
  data: LogRow[]
  users: { id: number; name: string }[]
  modelTypes: string[]
  actions: string[]
}

export function ActivityLogTable({
  data,
  users,
  modelTypes,
  actions,
}: ActivityLogTableProps) {
  const [filterUser, setFilterUser] = useState<string>("all")
  const [filterAction, setFilterAction] = useState<string>("all")
  const [filterModel, setFilterModel] = useState<string>("all")

  const filtered = data.filter((row) => {
    if (filterUser !== "all" && String(row.userId) !== filterUser) return false
    if (filterAction !== "all" && row.action !== filterAction) return false
    if (filterModel !== "all" && row.modelType !== filterModel) return false
    return true
  })

  return (
    <DataTable
      data={filtered}
      columns={columns}
      searchColumn="description"
      searchPlaceholder="Cari deskripsi..."
      selectable={false}
      pageSize={25}
      filters={
        <div className="flex flex-wrap gap-2">
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-[160px]" size="sm">
              <SelectValue placeholder="Semua pengguna" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua pengguna</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-[130px]" size="sm">
              <SelectValue placeholder="Semua aksi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua aksi</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {actionLabel[a] || a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterModel} onValueChange={setFilterModel}>
            <SelectTrigger className="w-[160px]" size="sm">
              <SelectValue placeholder="Semua model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua model</SelectItem>
              {modelTypes.map((m) => (
                <SelectItem key={m} value={m}>
                  {modelLabel[m] || m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  )
}
