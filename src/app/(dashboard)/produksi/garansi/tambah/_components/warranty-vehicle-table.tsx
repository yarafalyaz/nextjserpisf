"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"

export interface WarrantyVehicleRow {
  id: number
  slug: string | null
  plateNumber: string | null
  unit: string
  customerName: string | null
  coverageCount: number
}

const columnHelper = createColumnHelper<WarrantyVehicleRow>()

const columns = [
  columnHelper.accessor("plateNumber", {
    header: "Plat Nomor",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <span className="font-mono tabular-nums font-medium text-foreground">
        {info.getValue() ?? "-"}
      </span>
    ),
  }),
  columnHelper.accessor("unit", {
    header: "Unit",
    cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("customerName", {
    header: "Pelanggan",
    cell: (info) => (
      <span className="text-foreground">{info.getValue() ?? "-"}</span>
    ),
  }),
  columnHelper.accessor("coverageCount", {
    header: "Cakupan",
    cell: (info) => {
      const count = info.getValue()
      return (
        <StatusChip
          status={count > 0 ? "active" : "closed"}
          customLabel={count > 0 ? `${count} cakupan` : "Tanpa cakupan"}
        />
      )
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    meta: { align: "right" },
    cell: (info) => {
      const v = info.row.original
      return (
        <div className="flex justify-end">
          <Link
            href={`/produksi/garansi/tambah?kendaraan=${v.slug ?? v.id}`}
            className="inline-flex items-center min-h-11 sm:min-h-9 font-medium text-primary hover:underline cursor-pointer"
            aria-label={`Pilih kendaraan ${v.plateNumber ?? v.unit} untuk klaim garansi`}
          >
            Pilih
          </Link>
        </div>
      )
    },
  }),
]

export function WarrantyVehicleTable({ data }: { data: WarrantyVehicleRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar kendaraan aktif"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
