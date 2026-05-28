export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { PayrollTable } from "./_components/payroll-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import { BulkGeneratePayrollButton } from "./_components/bulk-generate-payroll-button"

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_payroll")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const payrolls = await prisma.payroll.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { employee: true },
  })

  const data = payrolls.map((p) => ({
    id: p.id,
    documentNo: p.documentNo,
    period: p.period,
    employeeName: p.employee?.name ?? null,
    baseSalary: Number(p.baseSalary),
    allowances: Number(p.allowances),
    deductions: Number(p.deductions),
    netSalary: Number(p.netSalary),
    totalAmount: Number(p.totalAmount),
    status: p.status,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Penggajian</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <BulkGeneratePayrollButton />
          <Link href="/sdm/penggajian/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface text-foreground border border-default hover:bg-surface-secondary hover:-translate-y-px hover:shadow-md transition-all" id="create-payroll-btn">
            + Proses Manual
          </Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama karyawan..." action="/sdm/penggajian" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "approved", "paid"].map((s) => (
              <Link key={s} href={`/sdm/penggajian?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <PayrollTable data={data} />
      </div>
    </div>
  )
}
