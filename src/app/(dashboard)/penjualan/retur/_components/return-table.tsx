"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { completeSalesReturn } from "@/actions/sales.actions"
import { entityHref } from "@/lib/utils/entity-url"

interface SalesReturn {
  id: number
  slug: string | null
  documentNo: string
  date: Date | string
  reason: string | null
  status: string
}

const columnHelper = createColumnHelper<SalesReturn>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={entityHref("/penjualan/retur", info.row.original)} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("reason", {
    header: "Alasan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/penjualan/retur", info.row.original)}
        editPermission="edit_sales_returns"
        deletePermission="delete_sales_returns"
        deleteId={info.row.original.id}
        processAction={
          info.row.original.status !== "completed" ? completeSalesReturn : undefined
        }
        processLabel="Selesaikan"
        processPermission="approve_sales_returns"
        processConfirmTitle="Selesaikan retur ini?"
        processConfirmBody="Barang retur akan masuk kembali ke stok dan jurnal retur penjualan diposting. Pastikan retur sudah benar."
        processSuccessMessage="Retur berhasil diselesaikan"
      />
    ),
  }),
]

interface ReturnTableProps {
  data: SalesReturn[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function ReturnTable({ data, total, page, pageSize, toolbar, filters }: ReturnTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar retur penjualan"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("salesReturn", ids)}
    />
  )
}
