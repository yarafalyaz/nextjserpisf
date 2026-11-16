"use client"

import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteStatutoryRule } from "@/actions/hrm.actions"
import { CloseRuleForm } from "./statutory-rule-forms"

export interface StatutoryRuleRow {
  id: number
  key: string
  value: string
  effectiveFrom: string
  effectiveTo: string | null
  source: string | null
}

const columnHelper = createColumnHelper<StatutoryRuleRow>()

export function StatutoryRulesTable({
  data,
  canEdit,
}: {
  data: StatutoryRuleRow[]
  canEdit: boolean
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("key", {
        header: "Kunci",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
      }),
      columnHelper.accessor("value", {
        header: "Nilai",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("effectiveFrom", {
        header: "Berlaku Sejak",
        cell: (info) => (
          <span className="font-mono tabular-nums">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("effectiveTo", {
        header: "Berlaku Sampai",
        cell: (info) => (
          <span className="font-mono tabular-nums">{info.getValue() ?? "-"}</span>
        ),
      }),
      columnHelper.accessor("source", {
        header: "Sumber",
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.display({
        id: "actions",
        header: "Aksi",
        meta: { align: "right" },
        cell: (info) => {
          const rule = info.row.original
          return (
            <div className="flex justify-end gap-2">
              {!rule.effectiveTo && <CloseRuleForm id={rule.id} canEdit={canEdit} />}
              {canEdit && <DeleteButton id={rule.id} action={deleteStatutoryRule} />}
            </div>
          )
        },
      }),
    ],
    [canEdit],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar aturan statutori"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
