export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { getHrScope, hrEmployeeScopeWhere, hrScopeWhere } from "@/lib/auth/hr-scope";
import { PayrollForm } from "@/components/forms/payroll-form";
import { PageHeader, BackButton } from "@/components/ui/page-header";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ubah Penggajian" };

export default async function EditPayrollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("edit_payroll");
  const scope = await getHrScope(user);

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound();

  const payroll = await prisma.payroll.findUnique({
    where: { id: numId, ...hrScopeWhere(scope) },
  });

  if (!payroll) notFound();
  if (payroll.status !== "draft") {
    // Only draft payrolls can be edited
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Ubah Penggajian"
          breadcrumbs={[
            { label: "Dasbor", href: "/" },
            { label: "SDM", href: "/sdm" },
            { label: "Penggajian", href: "/sdm/penggajian" },
            { label: "Ubah" },
          ]}
          actions={<BackButton href={`/sdm/penggajian/${id}`} />}
        />
        <div className="p-6 bg-danger/10 border border-danger/20 rounded-xl text-danger">
          Hanya penggajian dengan status <strong>Draft</strong> yang dapat
          diubah.
        </div>
      </div>
    );
  }

  const plainPayroll = {
    ...payroll,
    baseSalary: Number(payroll.baseSalary),
    allowances: Number(payroll.allowances),
    deductions: Number(payroll.deductions),
    overtimeTotal: Number(payroll.overtimeTotal),
    appreciationTotal: Number(payroll.appreciationTotal),
    loanDeduction: Number(payroll.loanDeduction),
    lateDeduction: Number(payroll.lateDeduction),
    netSalary: Number(payroll.netSalary),
    totalAmount: Number(payroll.totalAmount),
    startDate: payroll.startDate.toISOString(),
    endDate: payroll.endDate.toISOString(),
    paymentDate: payroll.paymentDate ? payroll.paymentDate.toISOString() : null,
    createdAt: payroll.createdAt.toISOString(),
    updatedAt: payroll.updatedAt.toISOString(),
  };

  const [employees, costCenters] = await Promise.all([
    prisma.employee.findMany({
      where: { ...hrEmployeeScopeWhere(scope), isActive: true, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.costCenter.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <PageHeader
        title={`Ubah Penggajian: ${payroll.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Penggajian", href: "/sdm/penggajian" },
          { label: payroll.documentNo, href: `/sdm/penggajian/${payroll.id}` },
          { label: "Ubah" },
        ]}
      />

      <PayrollForm employees={employees} initialData={plainPayroll} costCenters={costCenters} />
    </div>
  );
}
