"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { executeAllocation, deleteAllocationRule } from "@/actions/allocation.actions"
import { showSuccess, showError } from "@/lib/utils/toast"

interface AllocationRuleData {
  id: number
  name: string
  description: string | null
  isActive: boolean
  sourceAccount: { id: number; code: string; name: string }
  skf: { id: number; name: string; unit: string }
  targets: { costCenter: { id: number; code: string; name: string } }[]
}

interface Props {
  data: AllocationRuleData[]
  skfs: { id: number; name: string; unit: string }[]
  accounts: { id: number; code: string; name: string }[]
  costCenters: { id: number; code: string; name: string }[]
}

const columnHelper = createColumnHelper<AllocationRuleData>()

export function AllocationRuleList({ data }: Props) {
  const router = useRouter()
  const [executing, setExecuting] = useState<number | null>(null)
  const [period, setPeriod] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })

  // Generate period options (last 6 months)
  const periods: string[] = []
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  async function handleExecute(ruleId: number) {
    setExecuting(ruleId)
    const res = await executeAllocation(ruleId, period)
    if (res.success) {
      showSuccess(`Alokasi berhasil — Jurnal: ${res.journalNumber}`)
      router.refresh()
    } else {
      showError(res.error || "Gagal mengeksekusi")
    }
    setExecuting(null)
  }

  const columns = [
    columnHelper.accessor("name", {
      header: "Nama",
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor("sourceAccount", {
      header: "Akun Sumber",
      cell: (info) => `${info.getValue().code} — ${info.getValue().name}`,
    }),
    columnHelper.accessor("skf", {
      header: "Key Figure",
      cell: (info) => `${info.getValue().name} (${info.getValue().unit})`,
    }),
    columnHelper.accessor("targets", {
      header: "Target Pusat Biaya",
      cell: (info) => {
        const targets = info.getValue()
        if (targets.length === 0) return "Semua Pusat Biaya"
        return targets.map((t) => `${t.costCenter.code} — ${t.costCenter.name}`).join(", ")
      },
    }),
    columnHelper.display({
      id: "execute",
      header: "Eksekusi",
      enableSorting: false,
      cell: (info) => (
        <div className="flex items-center gap-2">
          <Combobox
            options={periods.map((p) => ({ value: p, label: p }))}
            value={period}
            onChange={(v) => { if (v) setPeriod(v) }}
            className="w-32"
            placeholder="Periode"
          />
          <Button
            variant="primary"
            size="sm"
            isDisabled={executing === info.row.original.id}
            onPress={() => handleExecute(info.row.original.id)}
          >
            {executing === info.row.original.id ? "..." : "Jalankan"}
          </Button>
        </div>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      enableSorting: false,
      cell: (info) => (
        <ActionDropdown
          viewHref={`/anggaran/alokasi-skf/${info.row.original.id}`}
          deleteAction={deleteAllocationRule}
          deleteId={info.row.original.id}
        />
      ),
    }),
  ]

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar aturan alokasi"
      pageSize={20}
      searchColumn="name"
      searchPlaceholder="Cari aturan..."
    />
  )
}
