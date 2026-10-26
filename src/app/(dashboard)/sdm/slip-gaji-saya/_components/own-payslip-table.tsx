"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"
import type { OwnPayslipListRow } from "@/lib/reports/payslip-self"

export type { OwnPayslipListRow }

const columnHelper = createColumnHelper<OwnPayslipListRow>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link
        href={entityHref("/sdm/slip-gaji-saya", info.row.original)}
        className="text-foreground hover:underline font-mono"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("period", {
    header: "Periode",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("statusLabel", {
    header: "Status",
    // statusLabel verbatim server (STATUS_LABELS) — UI dilarang memetakan
    // ulang dari field status (BR-PS-04 kontrak F-2026-10-25-009-S).
    cell: (info) => (
      <span className="px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("paymentDate", {
    header: "Tanggal Bayar",
    // Null bila approved belum dibayar — tanpa tanggal karangan (EC-3).
    cell: (info) =>
      info.getValue() ? (
        formatDate(info.getValue())
      ) : (
        <span className="text-muted-foreground">Belum dibayar</span>
      ),
  }),
  columnHelper.accessor("netSalary", {
    header: "Gaji Bersih",
    // Angka rekod final apa adanya; UI tidak menghitung ulang (BR-PS-04).
    cell: (info) => <span className="text-right block">{formatCurrency(info.getValue())}</span>,
  }),
]

/** Tabel slip gaji milik karyawan login (baca-saja, AC-PS-6). */
export function OwnPayslipTable({ data }: { data: OwnPayslipListRow[] }) {
  return <DataTable columns={columns} data={data} />
}
