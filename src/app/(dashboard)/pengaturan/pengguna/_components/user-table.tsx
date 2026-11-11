"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { entityHref } from "@/lib/utils/entity-url"
import { Pencil } from "@/components/ui/fontawesome-icons"
import { StatusChip } from "@/components/ui/status-chip"

export interface UserRow {
  id: number
  slug: string | null
  name: string
  email: string
  isActive: boolean
  roles: { id: number; name: string }[]
}

const columnHelper = createColumnHelper<UserRow>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link
        href={entityHref("/pengaturan/pengguna", info.row.original)}
        className="font-medium text-foreground hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("email", {
    header: "Email",
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("roles", {
    header: "Peran",
    enableSorting: false,
    cell: (info) => {
      const roles = info.getValue()
      if (!roles || roles.length === 0) {
        return <span className="text-xs text-muted-foreground italic">Tanpa Peran</span>
      }
      return (
        <div className="flex flex-wrap gap-1">
          {roles.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium border border-border bg-muted/60 text-foreground capitalize"
            >
              {r.name}
            </span>
          ))}
        </div>
      )
    },
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => {
      const active = info.getValue()
      return (
        <StatusChip
          status={active ? "active" : "inactive"}
          customLabel={active ? "Aktif" : "Nonaktif"}
          customTone={active ? "success" : "danger"}
        />
      )
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <Link
        href={entityHref("/pengaturan/pengguna", info.row.original)}
        className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer shadow-2xs"
        title="Ubah Pengguna"
        aria-label={`Ubah pengguna ${info.row.original.name}`}
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Link>
    ),
  }),
]

interface UserTableProps {
  data: UserRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function UserTable({ data, total, page, pageSize, toolbar, filters }: UserTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pengguna sistem"
      serverPagination={{ total, page, pageSize }}
      selectable={false}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
