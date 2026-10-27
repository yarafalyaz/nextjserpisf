export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { parsePagination } from "@/lib/utils/pagination";
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

  // Tautan lama `?bulan=&tahun=` diarahkan ke pasangan path (status/cari
  // dipertahankan sebagai query).
  if (params.bulan || params.tahun) {
    const legacyPath = buildPathFilterHref("/sdm/penggajian", {
      tahun: params.tahun,
      bulan: params.bulan,
    });
    const legacy = new URLSearchParams();
    if (params.status) legacy.set("status", params.status);
    if (params.cari) legacy.set("cari", params.cari);
    const legacyQuery = legacy.toString();
    redirect(legacyQuery ? `${legacyPath}?${legacyQuery}` : legacyPath);
  }

  const { segments } = await routeParams;
  const filters = parsePathFilterSegments(segments, {
    tahun: /^\d{4}$/,
    bulan: /^([1-9]|1[0-2])$/,
  });
  if (!filters) notFound();

  const { page, pageSize, take } = parsePagination(params);
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined;

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

  const total = await prisma.payroll.count({ where })

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
  const userPerms: string[] = (user as any).permissions ?? [];
  const showActions =
    userRoles.includes("super_admin") ||
    userPerms.includes("edit_payroll");
  const showEmployeeColumn = scope.kind !== "self";

  const settings = await prisma.systemSetting.findFirst();
  const cutoffDay = settings?.payrollCutoffDay ?? 25;

  // 070-F: antrean slip gaji draft mengendap (Backend PR #1107). Halaman
  // menegakkan process_payroll sebelum loader; loader menegakkan ulang
  // fail-closed (view_payroll saja tidak cukup tahap 1).
  const canProcessPayroll = await hasPermission("process_payroll");
  const payrollDraftQueue = canProcessPayroll ? await getPayrollDraftQueue() : null;

  // F-2026-10-24-132-V: panel kompensasi PKWT (read-model server murni).
  const [pkwtReport, pkwtEmployees, pkwtDraftSlips, canCreatePkwt, canApprovePkwt, canProcessPkwt, canAttachPkwt] =
    await Promise.all([
      getPkwtCompensationReport(scope),
      prisma.employee.findMany({
        where: { employmentStatus: "PKWT", isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, employeeNumber: true },
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

  const statusChips = ["", "draft", "approved", "paid"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] : "";
    const qstr = urlStatus ? `?status=${urlStatus}` : "";
    return (
      <Link
        key={dbStatus}
        href={`${filterPath}${qstr}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Penggajian</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <CanCreate permission="process_payroll">
            <BulkGeneratePayrollButton cutoffDay={cutoffDay} />
          </CanCreate>
          <CanCreate permission="create_employees">
            <Link
              href="/sdm/penggajian/komponen"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface text-foreground border border-default hover:bg-surface-secondary hover:-translate-y-px hover:shadow-md transition-all"
            >
              Komponen Gaji
            </Link>
          </CanCreate>
          <CanCreate permission="create_payroll">
            <Link
              href="/sdm/penggajian/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface text-foreground border border-default hover:bg-surface-secondary hover:-translate-y-px hover:shadow-md transition-all"
              id="create-payroll-btn"
            >
              + Proses Manual
            </Link>
          </CanCreate>
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
