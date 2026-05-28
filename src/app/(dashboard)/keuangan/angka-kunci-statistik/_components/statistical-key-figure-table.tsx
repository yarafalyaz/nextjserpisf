"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteStatisticalKeyFigure } from "@/actions/finance.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface StatisticalKeyFigureData {
  id: number
  name: string
  unit: string | null
  value: number
}

const columnHelper = createColumnHelper<StatisticalKeyFigureData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/keuangan/angka-kunci-statistik/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("unit", {
    header: "Satuan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("value", {
    header: "Nilai",
    cell: (info) => info.getValue(),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/keuangan/angka-kunci-statistik/${info.row.original.id}`}
        deleteAction={deleteStatisticalKeyFigure}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface StatisticalKeyFigureTableProps {
  data: StatisticalKeyFigureData[]
}

export function StatisticalKeyFigureTable({ data }: StatisticalKeyFigureTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar angka kunci statistik"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("statisticalKeyFigure", ids)}
    />
  )
}
