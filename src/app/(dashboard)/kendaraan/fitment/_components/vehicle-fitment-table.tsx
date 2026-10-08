"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteVehicleFitment } from "@/actions/vehicle-fitment.actions"
import { bulkDelete } from "@/actions/bulk.actions"

const RESULT_LABEL: Record<string, string> = {
  compatible: "Cocok",
  incompatible: "Tidak Cocok",
  unknown: "Belum Diketahui",
}

const RESULT_CLASS: Record<string, string> = {
  compatible: "bg-success/10 text-success",
  incompatible: "bg-danger/10 text-danger",
  unknown: "bg-muted text-muted-foreground",
}

interface VehicleFitmentData {
  id: number
  itemSku: string | null
  itemName: string
  brandName: string | null
  modelName: string | null
  variantName: string | null
  yearFrom: number | null
  yearTo: number | null
  drivetrain: string | null
  transmission: string | null
  result: string
  isActive: boolean
}

function ResultBadge({ result }: { result: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_CLASS[result] ?? RESULT_CLASS.unknown}`}>
      {RESULT_LABEL[result] ?? result}
    </span>
  )
}

const columnHelper = createColumnHelper<VehicleFitmentData>()

const columns = [
  columnHelper.accessor("itemName", {
    header: "Item",
    cell: (info) => (
      <Link href={`/kendaraan/fitment/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        <span className="font-mono text-xs text-muted-foreground mr-1.5">{info.row.original.itemSku}</span>
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.display({
    id: "scope",
    header: "Cakupan",
    cell: (info) => {
      const r = info.row.original
      const parts: string[] = []
      if (r.brandName) parts.push(r.brandName)
      if (r.modelName) parts.push(r.modelName)
      if (r.variantName) parts.push(r.variantName)
      if (parts.length === 0) parts.push("Semua kendaraan")
      return <span className="text-sm">{parts.join(" · ")}</span>
    },
  }),
  columnHelper.display({
    id: "constraints",
    header: "Batasan",
    cell: (info) => {
      const r = info.row.original
      const parts: string[] = []
      if (r.yearFrom != null || r.yearTo != null) {
        parts.push(`${r.yearFrom ?? "…"}–${r.yearTo ?? "…"}`)
      }
      if (r.drivetrain) parts.push(r.drivetrain)
      if (r.transmission) parts.push(r.transmission)
      return <span className="text-sm text-muted-foreground">{parts.length ? parts.join(", ") : "-"}</span>
    },
  }),
  columnHelper.display({
    id: "result",
    header: "Hasil",
    cell: (info) => <ResultBadge result={info.row.original.result} />,
  }),
  columnHelper.accessor("isActive", {
    header: "Aktif",
    cell: (info) => (info.getValue() ? "Ya" : "Tidak"),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/kendaraan/fitment/${info.row.original.id}`}
        editHref={`/kendaraan/fitment/${info.row.original.id}/ubah`}
        deleteAction={deleteVehicleFitment}
        deleteId={info.row.original.id}
        editPermission="edit_vehicle_fitments"
        deletePermission="delete_vehicle_fitments"
      />
    ),
  }),
]

interface VehicleFitmentTableProps {
  data: VehicleFitmentData[]
}

export function VehicleFitmentTable({ data }: VehicleFitmentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar aturan fitment kendaraan"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("vehicleFitmentRule", ids)}
    />
  )
}
