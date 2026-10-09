"use client"

import { createColumnHelper } from "@/lib/table"
import { useMemo } from "react"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteAppreciation } from "@/actions/hrm.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface AppreciationData {
  id: number
  slug: string | null
  employee: { name: string }
  date: string
  type: string
  amount: number
  notes: string | null
}

const columnHelper = createColumnHelper<AppreciationData>()

const typeLabels: Record<string, string> = {
  bonus: "Bonus",
  reward: "Reward",
  incentive: "Insentif",
}

const columns = [
  columnHelper.display({
    id: "no",
    header: "No",
    // A row counter is meaningless on a phone card; keep it desktop-only.
    meta: { mobile: false },
    cell: (info) => info.row.index + 1,
  }),
  columnHelper.accessor("employee", {
    header: "Karyawan",
    // The employee is the card's headline (the "No" column is hidden on mobile).
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/sdm/apresiasi", info.row.original)} className="text-foreground hover:underline font-medium">
        {info.getValue().name}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("type", {
    header: "Tipe",
    cell: (info) => typeLabels[info.getValue()] || info.getValue(),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => formatCurrency(info.getValue()),
  }),
  columnHelper.accessor("notes", {
    header: "Catatan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/sdm/apresiasi", info.row.original)}
        editHref={entityEditHref("/sdm/apresiasi", info.row.original)}
        deleteAction={deleteAppreciation}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface AppreciationTableProps {
  data: AppreciationData[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
  showActions?: boolean
}

export function AppreciationTable({ data, total, page, pageSize, toolbar, filters, showActions = true }: AppreciationTableProps) {
  const visibleColumns = useMemo(() => {
    if (!showActions) return columns.filter((c: any) => c.id !== "actions")
    return columns
  }, [showActions])

  return (
    <DataTable
      data={data}
      columns={visibleColumns}
      ariaLabel="Daftar apresiasi karyawan"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("appreciation", ids)}
    />
  )
}
