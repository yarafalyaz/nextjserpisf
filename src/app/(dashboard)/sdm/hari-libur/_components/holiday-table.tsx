"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteHoliday } from "@/actions/hrm.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface HolidayData {
  id: number
  name: string
  date: string
  description: string | null
}

const columnHelper = createColumnHelper<HolidayData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/sdm/hari-libur/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("description", {
    header: "Deskripsi",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/sdm/hari-libur/${info.row.original.id}`}
        editHref={`/sdm/hari-libur/${info.row.original.id}/ubah`}
        deleteAction={deleteHoliday}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface HolidayTableProps {
  data: HolidayData[]
}

export function HolidayTable({ data }: HolidayTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar hari libur"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama hari libur..."
      onBulkDelete={(ids) => bulkDelete("holiday", ids)}
    />
  )
}
