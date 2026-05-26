"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteOvertimeRequest } from "@/actions/hrm.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface OvertimeRequest {
  id: number
  employee: { name: string }
  date: Date | string
  hours: number | string
  reason: string | null
  status: string
}

const columnHelper = createColumnHelper<OvertimeRequest>()

const columns = [
  columnHelper.accessor((row) => row.employee.name, {
    id: "employeeName",
    header: "Karyawan",
    cell: (info) => (
      <Link href={`/hrm/overtime/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("hours", {
    header: "Jam",
    cell: (info) => Number(info.getValue()),
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
        viewHref={`/hrm/overtime/${info.row.original.id}`}
        deleteAction={deleteOvertimeRequest}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface OvertimeTableProps {
  data: OvertimeRequest[]
}

export function OvertimeTable({ data }: OvertimeTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar lembur"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("overtime", ids)}
    />
  )
}
