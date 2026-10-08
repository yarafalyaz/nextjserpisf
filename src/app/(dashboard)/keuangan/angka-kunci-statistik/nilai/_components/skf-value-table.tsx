"use client"

import { useMemo, useState } from "react"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { deleteSkfValue } from "@/actions/skf-values.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

interface SkfValueData {
  id: number
  statisticalKeyFigureId: number
  period: string
  value: number
  costCenterId: number | null
  statisticalKeyFigure: { id: number; name: string; code: string | null; unit: string }
  costCenter: { id: number; code: string; name: string } | null
}

interface Props {
  values: SkfValueData[]
  skfs: { id: number; code: string | null; name: string; unit: string }[]
  costCenters: { id: number; code: string; name: string }[]
}

const columnHelper = createColumnHelper<SkfValueData>()

const columns = [
  columnHelper.accessor("statisticalKeyFigure.name", {
    header: "Key Figure",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("period", {
    header: "Periode",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("costCenter", {
    header: "Pusat Biaya",
    cell: (info) => {
      const cc = info.getValue()
      return cc ? `${cc.code} — ${cc.name}` : "-"
    },
  }),
  columnHelper.accessor("value", {
    header: "Nilai",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("statisticalKeyFigure.unit", {
    header: "Satuan",
    cell: (info) => info.getValue(),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <Button
        variant="tertiary"
        size="sm"
        className="h-auto p-0 text-red-600 hover:text-red-700 hover:underline"
        onClick={async () => {
          if (!confirm("Hapus nilai ini?")) return
          const res = await deleteSkfValue(info.row.original.id)
          if (res.success) { showSuccess("Nilai berhasil dihapus"); window.location.reload() }
          else showError(res.error || "Gagal menghapus")
        }}
      >
        Hapus
      </Button>
    ),
  }),
]

export function SkfValueTable({ values, skfs, costCenters }: Props) {
  const [skfFilter, setSkfFilter] = useState("")
  const [periodFilter, setPeriodFilter] = useState("")
  const [costCenterFilter, setCostCenterFilter] = useState("")

  const periods = useMemo(() => {
    const set = new Set(values.map((v) => v.period))
    return [...set].sort().reverse()
  }, [values])

  const filtered = useMemo(() => {
    return values.filter((v) => {
      if (skfFilter && v.statisticalKeyFigureId !== Number(skfFilter)) return false
      if (periodFilter && v.period !== periodFilter) return false
      if (costCenterFilter && String(v.costCenterId ?? "") !== costCenterFilter) return false
      return true
    })
  }, [values, skfFilter, periodFilter, costCenterFilter])

  return (
    <div className="space-y-4">
      <div className="flex gap-4 flex-wrap">
        <div className="w-64">
          <Combobox
            options={skfs.map((s) => ({ value: String(s.id), label: `${s.code ? s.code + " — " : ""}${s.name}` }))}
            value={skfFilter}
            onChange={(v) => setSkfFilter(v ?? "")}
            placeholder="Semua Key Figure"
          />
        </div>
        <div className="w-48">
          <Combobox
            options={periods.map((p) => ({ value: p, label: p }))}
            value={periodFilter}
            onChange={(v) => setPeriodFilter(v ?? "")}
            placeholder="Semua Periode"
          />
        </div>
        <div className="w-64">
          <Combobox
            options={costCenters.map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name}` }))}
            value={costCenterFilter}
            onChange={(v) => setCostCenterFilter(v ?? "")}
            placeholder="Semua Pusat Biaya"
          />
        </div>
        {(skfFilter || periodFilter || costCenterFilter) && (
          <Button variant="outline" onPress={() => { setSkfFilter(""); setPeriodFilter(""); setCostCenterFilter("") }}>
            Reset
          </Button>
        )}
      </div>
      <DataTable
        data={filtered}
        columns={columns}
        ariaLabel="Daftar nilai key figure"
        pageSize={20}
      />
    </div>
  )
}
