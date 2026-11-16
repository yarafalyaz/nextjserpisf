"use client"

import { useMemo } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { CanCreate } from "@/components/auth/can-create"
import { Eye, Pencil } from "@/components/ui/fontawesome-icons"
import { deleteCustomerVehicle } from "@/actions/vehicle.actions"

export interface CustomerVehicleRow {
  id: number
  slug: string | null
  plateNumber: string | null
  brandName: string | null
  modelName: string | null
  variantName: string | null
  year: number | null
  color: string | null
  isActive: boolean
}

const columnHelper = createColumnHelper<CustomerVehicleRow>()

export function CustomerVehiclesTable({
  data,
  customerKey,
}: {
  data: CustomerVehicleRow[]
  customerKey: string | number
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("plateNumber", {
        header: "Plat Nomor",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-mono">{info.getValue() || "-"}</span>,
      }),
      columnHelper.accessor("brandName", {
        header: "Merek",
        cell: (info) => info.getValue() || "-",
      }),
      columnHelper.display({
        id: "model",
        header: "Model",
        cell: (info) => {
          const cv = info.row.original
          return `${cv.modelName || "-"}${cv.variantName ? ` (${cv.variantName})` : ""}`
        },
      }),
      columnHelper.accessor("year", {
        header: "Tahun",
        cell: (info) => info.getValue() || "-",
      }),
      columnHelper.accessor("color", {
        header: "Warna",
        cell: (info) => info.getValue() || "-",
      }),
      columnHelper.accessor("isActive", {
        header: "Status",
        cell: (info) => <StatusChip status={info.getValue() ? "active" : "inactive"} />,
      }),
      columnHelper.display({
        id: "actions",
        header: "Aksi",
        enableSorting: false,
        cell: (info) => {
          const cv = info.row.original
          return (
            <div className="flex items-center gap-1">
              <Link
                href={`/master/pelanggan/${customerKey}/kendaraan/${cv.slug ?? cv.id}`}
                className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 rounded-md hover:bg-surface-secondary transition-colors cursor-pointer"
                aria-label={`Detail ${cv.plateNumber || cv.id}`}
                title="Detail"
              >
                <Eye size={14} aria-hidden="true" />
              </Link>
              <CanCreate permission="edit_customers">
                <Link
                  href={`/master/pelanggan/${customerKey}/kendaraan/${cv.slug ?? cv.id}/ubah`}
                  className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 rounded-md hover:bg-surface-secondary transition-colors cursor-pointer"
                  aria-label={`Ubah ${cv.plateNumber || cv.id}`}
                  title="Ubah"
                >
                  <Pencil size={14} aria-hidden="true" />
                </Link>
              </CanCreate>
              <CanCreate permission="delete_customers">
                <DeleteButton id={cv.id} action={deleteCustomerVehicle} />
              </CanCreate>
            </div>
          )
        },
      }),
    ],
    [customerKey],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar kendaraan pelanggan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
