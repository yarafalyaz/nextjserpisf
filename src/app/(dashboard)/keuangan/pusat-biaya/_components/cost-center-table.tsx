"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteCostCenter } from "@/actions/finance.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { cn } from "@/lib/utils"

interface CostCenterData {
  id: number
  code: string
  name: string
  parentId?: number | null
  children?: CostCenterData[]
  _depth?: number
}

const columnHelper = createColumnHelper<CostCenterData>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => {
      const row = info.row.original
      const hasChildren = row.children && row.children.length > 0
      return (
        <div className={cn("flex items-center gap-1.5", row._depth && `ml-${row._depth * 4}`)}>
          {hasChildren && <ChevronRight className="size-3 text-muted-foreground shrink-0" />}
          <Link href={`/keuangan/pusat-biaya/${row.id}`} className="text-foreground hover:underline font-medium">
            {info.getValue()}
          </Link>
        </div>
      )
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/keuangan/pusat-biaya/${info.row.original.id}`}
        editHref={`/keuangan/pusat-biaya/${info.row.original.id}/ubah`}
        deleteAction={deleteCostCenter}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

function flattenTree(nodes: CostCenterData[], depth = 0): CostCenterData[] {
  const result: CostCenterData[] = []
  for (const node of nodes) {
    result.push({ ...node, _depth: depth })
    if (node.children && node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1))
    }
  }
  return result
}

interface CostCenterTableProps {
  data: CostCenterData[]
}

export function CostCenterTable({ data }: CostCenterTableProps) {
  const flatData = flattenTree(data)
  return (
    <DataTable
      data={flatData}
      columns={columns}
      ariaLabel="Daftar cost center"
      pageSize={50}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari kode atau nama..."
      onBulkDelete={(ids) => bulkDelete("costCenter", ids)}
    />
  )
}
