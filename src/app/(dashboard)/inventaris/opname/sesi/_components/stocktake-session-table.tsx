"use client"

import { useMemo } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { StocktakeActions } from "./stocktake-forms"

export interface StocktakeSessionRow {
  id: number
  slug: string | null
  documentNo: string
  warehouseName: string
  warehouseCode: string
  status: string
  lineCount: number
}

const columnHelper = createColumnHelper<StocktakeSessionRow>()

export function StocktakeSessionTable({
  data,
  canCreate,
  canEdit,
}: {
  data: StocktakeSessionRow[]
  canCreate: boolean
  canEdit: boolean
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("documentNo", {
        header: "Dokumen",
        meta: { mobilePrimary: true },
        cell: (info) => (
          <span className="font-mono font-medium text-foreground">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("warehouseName", {
        header: "Gudang",
        cell: (info) => {
          const row = info.row.original
          return (
            <span>
              <span className="font-medium text-foreground">{row.warehouseName}</span>
              <span className="text-muted-foreground ml-1.5 font-mono text-xs">({row.warehouseCode})</span>
            </span>
          )
        },
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusChip status={info.getValue()} />,
      }),
      columnHelper.accessor("lineCount", {
        header: "Baris Item",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums text-foreground">
            {info.getValue()} baris
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "Aksi",
        meta: { align: "right" },
        cell: (info) => {
          const row = info.row.original
          return (
            <div className="flex justify-end items-center gap-2">
              <Link
                href={entityHref("/inventaris/opname/sesi", row)}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
              >
                Buka
              </Link>
              <StocktakeActions
                id={row.id}
                status={row.status}
                canCreate={canCreate}
                canEdit={canEdit}
              />
            </div>
          )
        },
      }),
    ],
    [canCreate, canEdit],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar Sesi Opname"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
