"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteRole } from "@/actions/roles.actions"
import { formatDate } from "@/lib/utils/format"
import { ShieldCheck, Lock } from "@/components/ui/fontawesome-icons"

export interface RoleRow {
  id: number
  slug: string | null
  name: string
  guardName: string
  isSystem: boolean
  permissionsCount: number
  usersCount: number
  createdAt: string | Date
}

const columnHelper = createColumnHelper<RoleRow>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama Peran",
    cell: (info) => (
      <div className="flex items-center gap-2">
        <Link
          href={entityHref("/pengaturan/peran", info.row.original)}
          className="font-semibold text-foreground hover:underline capitalize"
        >
          {info.getValue()}
        </Link>
        {info.row.original.isSystem && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium bg-muted text-muted-foreground border border-border"
            title="Peran bawaan sistem yang dilindungi"
          >
            <Lock className="size-2.5" aria-hidden="true" />
            <span>Sistem</span>
          </span>
        )}
      </div>
    ),
  }),
  columnHelper.accessor("permissionsCount", {
    header: "Cakupan Izin",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-primary/10 text-primary">
        <ShieldCheck className="size-3" aria-hidden="true" />
        <span>{info.getValue()} hak akses</span>
      </span>
    ),
  }),
  columnHelper.accessor("usersCount", {
    header: "Pengguna Terkait",
    cell: (info) => (
      <span className="text-xs font-mono tabular-nums text-foreground">
        {info.getValue()} pengguna
      </span>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => (
      <span className="text-xs text-muted-foreground">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => {
      const role = info.row.original
      return (
        <div className="flex items-center gap-1.5">
          <Link
            href={entityHref("/pengaturan/peran", role)}
            className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-md text-xs font-medium border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
          >
            Detail
          </Link>
          <Link
            href={entityEditHref("/pengaturan/peran", role)}
            className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-md text-xs font-medium border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
          >
            Ubah
          </Link>
          {!role.isSystem && (
            <DeleteButton
              id={role.id}
              action={deleteRole}
              label={`Hapus peran ${role.name}`}
            />
          )}
        </div>
      )
    },
  }),
]

interface RoleTableProps {
  data: RoleRow[]
  toolbar?: React.ReactNode
}

export function RoleTable({ data, toolbar }: RoleTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar peran dan hak akses"
      selectable={false}
      toolbar={toolbar}
      pageSize={20}
    />
  )
}
