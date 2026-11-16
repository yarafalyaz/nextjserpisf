"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { Pencil } from "@/components/ui/fontawesome-icons"
import { entityEditHref } from "@/lib/utils/entity-url"

export interface AccountGroupRow {
  id: number
  slug: string | null
  code: string
  name: string
  reportGroup: string | null
  reportGroupLabel: string | null
  level: number
  hasChildren: boolean
}

const columnHelper = createColumnHelper<AccountGroupRow>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => (
      <span className={info.row.original.hasChildren ? "font-mono font-semibold" : "font-mono"}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("name", {
    header: "Nama Akun",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const acc = info.row.original
      return (
        <div className={acc.hasChildren ? "font-semibold" : undefined}>
          <span style={{ paddingLeft: `${acc.level * 1.25}rem` }}>{acc.name}</span>
          {acc.reportGroupLabel && acc.reportGroupLabel !== acc.name ? (
            <span
              className="ml-2 rounded border border-default px-1.5 py-0.5 text-[0.6875rem] font-normal text-muted-foreground"
              title={acc.reportGroup ?? undefined}
            >
              {acc.reportGroupLabel}
            </span>
          ) : null}
        </div>
      )
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => {
      const acc = info.row.original
      return (
        <Link
          href={entityEditHref("/master/akun", acc)}
          className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          aria-label={`Ubah ${acc.name}`}
        >
          <Pencil size={14} aria-hidden="true" />
        </Link>
      )
    },
  }),
]

export function AccountsGroupTable({
  data,
  ariaLabel,
}: {
  data: AccountGroupRow[]
  ariaLabel: string
}) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel={ariaLabel}
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
