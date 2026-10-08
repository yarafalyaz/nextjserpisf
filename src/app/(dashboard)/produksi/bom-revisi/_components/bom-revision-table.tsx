"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"
import { BomRevisionActions } from "./bom-revision-actions"

export interface BomRevisionRow {
  id: number
  revisionNo: number
  status: string
  effectiveDate: string
  productId: number
  productName: string
  materialsCount: number
}

const columnHelper = createColumnHelper<BomRevisionRow>()

const columns = [
  columnHelper.display({
    id: "revision",
    header: "Revisi",
    cell: (info) => (
      <Link
        href={`/produksi/bom-revisi/${info.row.original.id}`}
        className="text-foreground hover:underline font-medium font-mono"
      >
        Rev {info.row.original.revisionNo}
      </Link>
    ),
  }),
  columnHelper.accessor("productName", {
    header: "Produk",
    cell: (info) => (
      <Link href={`/produksi/products/${info.row.original.productId}`} className="hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  columnHelper.accessor("materialsCount", {
    header: "Material",
    cell: (info) => `${info.getValue()} material`,
  }),
  columnHelper.accessor("effectiveDate", {
    header: "Berlaku",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => <BomRevisionActions revision={info.row.original} />,
  }),
]

export function BomRevisionTable({ data }: { data: BomRevisionRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar revisi BOM"
      pageSize={20}
      searchColumn="productName"
      searchPlaceholder="Cari produk..."
    />
  )
}
