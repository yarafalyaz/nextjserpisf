"use client"

import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@tanstack/react-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteExpenseCategory } from "@/actions/expense-category.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface CategoryRow {
  id: number
  name: string
  label: string
  sortOrder: number
  isActive: boolean
}

const columnHelper = createColumnHelper<CategoryRow>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/master/kategori-pengeluaran/${info.row.original.id}`} className="font-mono text-xs text-foreground hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("label", {
    header: "Label",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("sortOrder", {
    header: "Urutan",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) =>
      info.getValue() ? (
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Aktif</span>
      ) : (
        <span className="text-xs font-medium text-muted-foreground">Nonaktif</span>
      ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/master/kategori-pengeluaran/${info.row.original.id}`}
        editHref={`/master/kategori-pengeluaran/${info.row.original.id}/ubah`}
        deleteAction={deleteExpenseCategory as unknown as (id: number) => Promise<{ success: boolean; error?: string }>}
        deleteId={info.row.original.id}
        editPermission="manage_expense_categories"
        deletePermission="manage_expense_categories"
      />
    ),
  }),
]

export function CategoryTable({ data }: { data: CategoryRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Kategori pengeluaran"
      pageSize={50}
      onBulkDelete={(ids) => bulkDelete("expenseCategory", ids)}
    />
  )
}
