"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteDownPayment } from "@/actions/sales.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref } from "@/lib/utils/entity-url"

import { statusLabel } from "@/lib/utils/status-labels"
import {
  DownPaymentTaxStatusBadge,
  type DownPaymentVatSnapshotView,
} from "./down-payment-vat-snapshot"

interface DownPayment {
  id: number
  slug: string | null
  quotation: { documentNo: string; customer: { name: string } }
  amount: number | string
  status: string
  createdAt: Date | string
  /** Snapshot PPN verbatim server (read-model PR #785); null = belum ada baris read-model. */
  vatSnapshot?: DownPaymentVatSnapshotView | null
}

const columnHelper = createColumnHelper<DownPayment>()

const columns = [
  columnHelper.accessor((row) => row.quotation.documentNo, {
    id: "quotationDocumentNo",
    header: "Penawaran",
    cell: (info) => (
      <Link href={entityHref("/penjualan/uang-muka", info.row.original)} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor((row) => row.quotation.customer.name, {
    id: "customerName",
    header: "Pelanggan",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah Uang Muka",
    cell: (info) => <span className="text-right">{formatCurrency(Number(info.getValue()))}</span>,
  }),
  columnHelper.accessor((row) => row.vatSnapshot ?? null, {
    id: "vatSnapshot",
    header: "Snapshot PPN",
    cell: (info) => {
      const snap = info.getValue()
      if (!snap) return <span className="text-muted-foreground">Belum ada snapshot PPN tercatat</span>
      return (
        <span className="flex flex-col items-start gap-1">
          <span>{snap.vatAmount === null ? "PPN —" : `PPN ${formatCurrency(snap.vatAmount)}`} · {snap.pkpSnapshotLabel}</span>
          <DownPaymentTaxStatusBadge snapshot={snap} />
        </span>
      )
    },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <span className={`status-badge status-${val}`}>{statusLabel(val)}</span>
    },
  }),
  columnHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        deleteAction={deleteDownPayment}
        deleteId={info.row.original.id}
        editPermission="edit_down_payments"
        deletePermission="delete_down_payments"
      />
    ),
  }),
]

interface DownPaymentTableProps {
  data: DownPayment[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function DownPaymentTable({ data, total, page, pageSize, toolbar, filters }: DownPaymentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar uang muka"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("downPayment", ids)}
    />
  )
}
