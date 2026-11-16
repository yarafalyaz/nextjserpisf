"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatDate } from "@/lib/utils/format"

export interface TicketCommentRow {
  id: number
  authorName: string
  body: string
  isInternal: boolean
  createdAt: string
}

const columnHelper = createColumnHelper<TicketCommentRow>()

const columns = [
  columnHelper.accessor("authorName", {
    header: "Pengguna",
  }),
  columnHelper.accessor("body", {
    header: "Komentar",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const comment = info.row.original
      return (
        <div>
          {comment.isInternal && (
            <span className="mr-2 inline-block align-middle text-[0.6875rem] font-medium px-2 py-0.5 rounded-full border border-default text-muted-foreground">
              Internal
            </span>
          )}
          {comment.body}
        </div>
      )
    },
  }),
  columnHelper.accessor("createdAt", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
]

export function TicketCommentsTable({ data }: { data: TicketCommentRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar komentar tiket"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
