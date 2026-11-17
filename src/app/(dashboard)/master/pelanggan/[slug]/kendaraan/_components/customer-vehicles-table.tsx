"use client"

import { useMemo } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
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
  canEdit,
  canDelete,
}: {
  data: CustomerVehicleRow[]
  customerKey: string | number
  /**
   * Izin dihitung di Server Component dan diteruskan sebagai prop.
   * Komponen ini `"use client"`: mengimpor `CanCreate`/`hasPermission`
   * dari sini menyeret `lib/auth/permissions` -> `auth` -> Prisma/crypto
   * -> `node:fs` ke bundel browser, dan Turbopack menolak build
   * ("does not support external modules (request: node:fs)"). Terjadi
   * 2026-11-17: build produksi gagal total di halaman ini. `CanCreate`
   * tetap sah untuk rantai Server Component.
   */
  canEdit: boolean
  canDelete: boolean
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
              {canEdit && (
                <Link
                  href={`/master/pelanggan/${customerKey}/kendaraan/${cv.slug ?? cv.id}/ubah`}
                  className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 rounded-md hover:bg-surface-secondary transition-colors cursor-pointer"
                  aria-label={`Ubah ${cv.plateNumber || cv.id}`}
                  title="Ubah"
                >
                  <Pencil size={14} aria-hidden="true" />
                </Link>
              )}
              {canDelete && <DeleteButton id={cv.id} action={deleteCustomerVehicle} />}
            </div>
          )
        },
      }),
    ],
    [customerKey, canEdit, canDelete],
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
