"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate, formatNumber } from "@/lib/utils/format"
import {
  WORK_ORDER_OPERATION_COLUMN_LABELS,
  WORK_ORDER_OPERATION_MARKERS,
  WORK_ORDER_OPERATION_QUEUE_TITLE,
} from "@/lib/reports/work-order-operation-queue"

export interface WorkOrderOperationQueueRow {
  id: number
  operationId: number
  workOrderId: number
  workOrderSlug: string | null
  name: string
  flags: string[]
  blockedByName: string | null
  documentNo: string
  workOrderStatus: string
  statusLabel: string
  umurLabel: string
  sumberUmur: string
  tingkatLabel: string
  workCenterLabel: string
  assigneeLabel: string
  estimatedHours: number | null
  workOrderEndDate: string | null
}

const labels = WORK_ORDER_OPERATION_COLUMN_LABELS
const columnHelper = createColumnHelper<WorkOrderOperationQueueRow>()

const columns = [
  columnHelper.accessor("name", {
    header: labels.operation,
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          <Link
            href={entityHref("/produksi/perintah-kerja", {
              id: row.workOrderId,
              slug: row.workOrderSlug,
            })}
            className="font-medium text-primary hover:underline"
          >
            {row.name}
          </Link>
          {row.flags.map((flag) => (
            <span key={flag} className="block text-xs font-medium text-destructive">
              {flag}
              {flag === WORK_ORDER_OPERATION_MARKERS.TERHALANG_TAHAP_SEBELUMNYA &&
              row.blockedByName
                ? `: ${row.blockedByName}`
                : ""}
            </span>
          ))}
        </div>
      )
    },
  }),
  columnHelper.accessor("documentNo", {
    header: labels.workOrder,
    cell: (info) => (
      <span className="font-mono text-foreground">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("workOrderStatus", {
    header: labels.workOrderStatus,
    cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("statusLabel", {
    header: labels.status,
    cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("umurLabel", {
    header: labels.umur,
    cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("sumberUmur", {
    header: labels.sumberUmur,
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("tingkatLabel", {
    header: labels.tingkat,
    cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("workCenterLabel", {
    header: labels.workCenter,
    cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("assigneeLabel", {
    header: labels.assignee,
    cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("estimatedHours", {
    header: labels.estimatedHours,
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {info.getValue() === null ? "-" : formatNumber(info.getValue()!)}
      </span>
    ),
  }),
  columnHelper.accessor("workOrderEndDate", {
    header: labels.endDate,
    cell: (info) => (
      <span className="tabular-nums text-foreground">
        {info.getValue() ? formatDate(info.getValue()!) : "-"}
      </span>
    ),
  }),
]

export function WorkOrderOperationQueueTable({
  data,
}: {
  data: WorkOrderOperationQueueRow[]
}) {
  return (
    <div data-report-table={WORK_ORDER_OPERATION_QUEUE_TITLE}>
      <DataTable
        data={data}
        columns={columns}
        ariaLabel={WORK_ORDER_OPERATION_QUEUE_TITLE}
        selectable={false}
        enableColumnToggle={false}
        enableExport={false}
        pageSize={50}
      />
    </div>
  )
}
