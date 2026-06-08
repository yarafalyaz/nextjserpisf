"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteAssetTransfer } from "@/actions/asset.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface AssetTransferData {
  id: number
  asset: { name: string }
  fromLocation: string | null
  toLocation: string
  transferDate: string
}

const columnHelper = createColumnHelper<AssetTransferData>()

const columns = [
  columnHelper.accessor("asset.name", {
    id: "assetName",
    header: "Aset",
    cell: (info) => (
      <Link href={`/aset/transfer/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("fromLocation", {
    header: "Dari",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("toLocation", {
    header: "Ke",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("transferDate", {
    header: "Tanggal Transfer",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/aset/transfer/${info.row.original.id}`}
        deleteAction={deleteAssetTransfer}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface AssetTransferTableProps {
  data: AssetTransferData[]
}

export function AssetTransferTable({ data }: AssetTransferTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar transfer aset"
      pageSize={20}
      selectable={true}
      searchColumn="assetName"
      searchPlaceholder="Cari nama aset..."
      onBulkDelete={(ids) => bulkDelete("assetTransfer", ids)}
    />
  )
}
