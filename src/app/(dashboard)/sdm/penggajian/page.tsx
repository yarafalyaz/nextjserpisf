export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { parsePagination } from "@/lib/utils/pagination";
import { requirePermission } from "@/lib/auth/permissions";
import { auth } from "@/lib/auth/auth";
import Link from "next/link";
import { statusLabel } from "@/lib/utils/status-labels";
import { AppSearchField } from "@/components/ui/search-field";
import { PayrollTable } from "./_components/payroll-table";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";

import { BulkGeneratePayrollButton } from "./_components/bulk-generate-payroll-button";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Penggajian" };

const statusToIndo: Record<string, string> = {
  draft: "konsep",
  approved: "disetujui",
  paid: "dibayar",
};

const indoToStatus: Record<string, string> = {
  konsep: "draft",
  disetujui: "approved",
  dibayar: "paid",
};

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    cari?: string;
    bulan?: string;
    tahun?: string;
    halaman?: string;
    pageSize?: string;
  }>;
}) {
  const user = await requirePermission("view_payroll");

  const params = await searchParams;

  const { page, pageSize, take } = parsePagination(params);
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined;

  const month = params.bulan ? Number(params.bulan) : undefined;
  const year = params.tahun ? Number(params.tahun) : undefined;

  // Role-scope: non-HR/admin only sees own payroll
  const isPrivileged =
    user.roles.includes("super_admin") || user.roles.includes("hr");
  let employeeFilter: { employeeId: number } | { employeeId: -1 } | undefined;
  if (!isPrivileged) {
    const session = await auth();
    const me = session?.user?.id
      ? await prisma.employee.findFirst({
          where: { userId: Number(session.user.id) },
          select: { id: true },
        })
      : null;
    employeeFilter = { employeeId: me?.id ?? -1 };
  }

  const where = {
    ...employeeFilter,
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { employee: { name: { contains: params.cari } } },
      ],
    }),
    ...(dbStatusParam && { status: dbStatusParam }),
    ...(month &&
      year && {
        endDate: {
          gte: new Date(Date.UTC(year, month - 1, 1)),
          lt: new Date(Date.UTC(year, month, 1)),
        },
      }),
  };

  const payrolls = await prisma.payroll.findMany({
    where,
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
    include: { employee: true },
  });

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
  }));

  const settings = await prisma.systemSetting.findFirst();
  const cutoffDay = settings?.payrollCutoffDay ?? 25;

  const statusChips = ["", "draft", "approved", "paid"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] : "";
    const qs = new URLSearchParams();
    if (urlStatus) qs.set("status", urlStatus);
    if (month) qs.set("bulan", String(month));
    if (year) qs.set("tahun", String(year));
    const qstr = qs.toString();
    return (
      <Link
        key={dbStatus}
        href={`/sdm/penggajian${qstr ? `?${qstr}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Penggajian</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <BulkGeneratePayrollButton cutoffDay={cutoffDay} />
          <Link
            href="/sdm/penggajian/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface text-foreground border border-default hover:bg-surface-secondary hover:-translate-y-px hover:shadow-md transition-all"
            id="create-payroll-btn"
          >
            + Proses Manual
          </Link>
        </div>
      </div>

      <PayrollTable
        data={data}
        toolbar={
          <AppSearchField
            placeholder="Cari nama karyawan..."
            action="/sdm/penggajian"
          />
        }
        filters={
          <>
            <div className="flex gap-2 flex-wrap items-center">
              <form className="flex gap-2" action="/sdm/penggajian">
                <FormSelect
                  name="bulan"
                  defaultValue={params.bulan ?? ""}
                  placeholder="Bulan"
                  className="min-w-[140px]"
                  options={[
                    { value: "", label: "Semua Bulan" },
                    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
                      value: String(m),
                      label: new Date(2026, m - 1).toLocaleString("id-ID", {
                        month: "long",
                      }),
                    })),
                  ]}
                />
                <FormSelect
                  name="tahun"
                  defaultValue={params.tahun ?? ""}
                  placeholder="Tahun"
                  className="min-w-[110px]"
                  options={[
                    { value: "", label: "Semua Tahun" },
                    ...[2025, 2026, 2027].map((y) => ({
                      value: String(y),
                      label: String(y),
                    })),
                  ]}
                />
                {params.status && (
                  <input type="hidden" name="status" value={params.status} />
                )}
                <Button type="submit">Filter</Button>
              </form>
              {month && year && (
                <Link
                  href={`/sdm/penggajian${params.status ? `?status=${params.status}` : ""}`}
                  className="text-xs text-primary hover:underline"
                >
                  Reset bulan
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">{statusChips}</div>
          </>
        }
      />
    </div>
  );
}
