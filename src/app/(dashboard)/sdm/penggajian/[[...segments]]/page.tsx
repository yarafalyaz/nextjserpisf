export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { parsePagination } from "@/lib/utils/pagination";
import { withListParams } from "@/lib/utils/list-href";
import { requirePermission } from "@/lib/auth/permissions";
import { getHrScope, hrScopeWhere, canSearchAcrossEmployees } from "@/lib/auth/hr-scope";
import Link from "next/link";
import { statusLabel } from "@/lib/utils/status-labels";
import { AppSearchField } from "@/components/ui/search-field";
import { notFound, redirect } from "next/navigation";
import { PayrollTable } from "../_components/payroll-table";
import { PayrollFilterForm } from "../_components/payroll-filter-form";
import { buildPathFilterHref, parsePathFilterSegments } from "@/lib/utils/path-filters";

import { BulkGeneratePayrollButton } from "../_components/bulk-generate-payroll-button";
import { getPayrollDraftQueue } from "@/lib/reports/payroll-draft-queue-data";
import { PayrollDraftQueueCard } from "@/components/reports/payroll-draft-queue-card";
import { getPkwtCompensationReport } from "@/lib/reports/pkwt-compensation-data";
import { hasPermission } from "@/lib/auth/permissions";
import { PkwtCompensationPanel } from "@/components/payroll/pkwt-compensation-panel";
import { CanCreate } from "@/components/auth/can-create";
import { Banknote, Clock, CheckCircle2, Wallet, Plus, Settings } from "@/components/ui/fontawesome-icons";
import { formatCurrency } from "@/lib/utils/format";

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
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>;
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
  // Self-service scoping via helper terpusat: karyawan→sendiri,
  // kepala_bengkel→se-departemen, HR/finance/admin/ga→semua. (Sebelumnya hanya
  // super_admin||hr yang privileged, sehingga admin/finance/ga keliru ter-scope
  // ke dirinya sendiri.)
  const scope = await getHrScope(user);

  const params = await searchParams;

  const { segments } = await routeParams;
  const filters = parsePathFilterSegments(segments, {
    tahun: /^\d{4}$/,
    bulan: /^([1-9]|1[0-2])$/,
    status: /^[a-z_-]+$/,
  });
  if (!filters) notFound();

  // Redirect legacy ?status= or ?bulan=/?tahun=
  if (params.bulan || params.tahun || params.status) {
    const legacyPath = buildPathFilterHref("/sdm/penggajian", {
      tahun: params.tahun ?? filters.tahun,
      bulan: params.bulan ?? filters.bulan,
      status: params.status ?? filters.status,
    });
    const legacy = new URLSearchParams();
    if (params.cari) legacy.set("cari", params.cari);
    if (params.halaman) legacy.set("halaman", params.halaman);
    if (params.pageSize) legacy.set("pageSize", params.pageSize);
    const legacyQuery = legacy.toString();
    redirect(legacyQuery ? `${legacyPath}?${legacyQuery}` : legacyPath);
  }

  const { page, pageSize, take } = parsePagination(params);
  const activeUrlStatus = filters.status ?? "";
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined;

  const month = filters.bulan ? Number(filters.bulan) : undefined;
  const year = filters.tahun ? Number(filters.tahun) : undefined;

  const where = {
    ...hrScopeWhere(scope),
    ...(params.cari && canSearchAcrossEmployees(scope) && {
      OR: [
        { documentNo: { contains: params.cari } },
        { employee: { name: { contains: params.cari } } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
    ...(month &&
      year && {
        endDate: {
          gte: new Date(Date.UTC(year, month - 1, 1)),
          lt: new Date(Date.UTC(year, month, 1)),
        },
      }),
  };

  const [payrolls, total, statusGroups, netSalaryAgg, settings, canProcessPayroll] = await Promise.all([
    prisma.payroll.findMany({
      where,
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
      include: { employee: true },
    }),
    prisma.payroll.count({ where }),
    prisma.payroll.groupBy({
      by: ["status"],
      where: hrScopeWhere(scope),
      _count: { id: true },
    }),
    prisma.payroll.aggregate({
      where: {
        ...hrScopeWhere(scope),
        status: { in: ["approved", "paid"] },
      },
      _sum: { netSalary: true },
    }),
    prisma.systemSetting.findFirst(),
    hasPermission("process_payroll"),
  ]);

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    draft: 0,
    approved: 0,
    paid: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count?.id ?? 0
    }
  }

  const totalNetSum = Number(netSalaryAgg._sum.netSalary ?? 0)

  const data = payrolls.map((p) => ({
    id: p.id,
    slug: p.slug,
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

  const userRoles: string[] = user.roles ?? [];
  const userPerms: string[] = user.permissions ?? [];
  const showActions =
    userRoles.includes("super_admin") ||
    userPerms.includes("edit_payroll");
  const showEmployeeColumn = scope.kind !== "self";

  const cutoffDay = settings?.payrollCutoffDay ?? 25;

  // 070-F: antrean slip gaji draft mengendap (Backend PR #1107). Halaman
  // menegakkan process_payroll sebelum loader; loader menegakkan ulang
  // fail-closed (view_payroll saja tidak cukup tahap 1).
  const payrollDraftQueue = canProcessPayroll ? await getPayrollDraftQueue() : null;

  // F-2026-10-24-132-V: panel kompensasi PKWT (read-model server murni).
  const [pkwtReport, pkwtEmployees, pkwtDraftSlips, canCreatePkwt, canApprovePkwt, canProcessPkwt, canAttachPkwt] =
    await Promise.all([
      getPkwtCompensationReport(scope),
      prisma.employee.findMany({
        where: { employmentStatus: "PKWT", isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, employeeNo: true },
      }),
      prisma.payroll.findMany({
        where: { status: "draft", ...hrScopeWhere(scope) },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          documentNo: true,
          employeeId: true,
          period: true,
          employee: { select: { name: true } },
        },
      }),
      hasPermission("edit_payroll"),
      hasPermission("process_payroll"),
      hasPermission("process_payroll"),
      hasPermission("edit_payroll"),
    ]);

  const filterPath = buildPathFilterHref("/sdm/penggajian", {
    tahun: filters.tahun,
    bulan: filters.bulan,
  });

  const statusChips = ["", "draft", "approved", "paid"].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : "";
    const chipFilterPath = buildPathFilterHref("/sdm/penggajian", {
      tahun: filters.tahun,
      bulan: filters.bulan,
      status: urlStatus || undefined,
    });
    const isActive = activeUrlStatus === urlStatus;
    const count = dbStatusKey ? (counts[dbStatusKey] ?? 0) : counts.all;

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(chipFilterPath, params, {
          halaman: undefined,
        })}
        className={`filter-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          isActive
            ? "border-primary bg-primary/10 text-primary font-semibold"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span>{dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}</span>
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
            isActive
              ? "bg-primary text-primary-foreground font-bold"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      </Link>
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Penggajian & Remunerasi (Payroll)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Proses kalkulasi gaji bruto/netto karyawan, komponen tunjangan, potongan statutori PPh 21 / BPJS, dan cetak slip gaji.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <CanCreate permission="create_payroll">
            <BulkGeneratePayrollButton cutoffDay={cutoffDay} />
          </CanCreate>
          <CanCreate permission="create_employees">
            <Link
              href="/sdm/penggajian/komponen"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
            >
              <Settings className="size-3.5" aria-hidden="true" />
              <span>Komponen Gaji</span>
            </Link>
          </CanCreate>
          <CanCreate permission="create_payroll">
            <Link
              href="/sdm/penggajian/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
              id="create-payroll-btn"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Proses Manual</span>
            </Link>
          </CanCreate>
        </div>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Slip Gaji
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <Banknote className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh arsip periode aktif</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Konsep (Draft)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.draft}
            </span>
            <Clock className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Perlu verifikasi & audit HR</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Disetujui
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400 font-mono tabular-nums">
              {counts.approved}
            </span>
            <CheckCircle2 className="size-4 text-blue-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Siap diproses transfer bank</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Gaji Netto
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {formatCurrency(totalNetSum)}
            </span>
            <Wallet className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Slip disetujui & terbayar</span>
        </div>
      </div>

      {payrollDraftQueue ? <PayrollDraftQueueCard queue={payrollDraftQueue} /> : null}

      <PkwtCompensationPanel
        report={pkwtReport}
        employees={pkwtEmployees}
        draftSlips={pkwtDraftSlips.map((slip) => ({
          id: slip.id,
          documentNo: slip.documentNo,
          employeeId: slip.employeeId,
          employeeName: slip.employee?.name ?? null,
          period: slip.period,
        }))}
        canCreate={canCreatePkwt}
        canApprove={canApprovePkwt}
        canRunAccrual={canProcessPkwt}
        canAttach={canAttachPkwt}
      />

      <PayrollTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        showActions={showActions}
        showEmployeeColumn={showEmployeeColumn}
        toolbar={
          <AppSearchField
            placeholder="Cari nama karyawan..."
            action={filterPath}
          />
        }
        filters={
          <>
            <PayrollFilterForm bulan={filters.bulan} tahun={filters.tahun} status={params.status} />
            <div className="flex flex-wrap gap-1.5">{statusChips}</div>
          </>
        }
      />
    </div>
  );
}
