export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
import { EmployeeForm } from "@/components/forms/employee-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { resolveEntity } from "@/lib/utils/resolve-entity";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ubah Karyawan" };

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requirePermission("edit_employees");

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.employee.findFirst({
          where: { slug: s },
          include: {
            user: {
              include: {
                roles: true,
              },
            },
          },
        }),
      byId: (id) =>
        prisma.employee.findUnique({
          where: { id },
          include: {
            user: {
              include: {
                roles: true,
              },
            },
          },
        }),
    },
  );

  if (!data) notFound();

  const employee = {
    id: data.id,
    employeeNo: data.employeeNo,
    name: data.name,
    email: data.email,
    phone: data.phone,
    gender: data.gender,
    dateOfBirth: data.dateOfBirth?.toISOString().split("T")[0] ?? null,
    maritalStatus: data.maritalStatus,
    dependents: data.dependents ?? 0,
    departmentId: data.departmentId,
    positionId: data.positionId,
    leaveEligibilityStartDate: data.leaveEligibilityStartDate
      ? data.leaveEligibilityStartDate.toISOString()
      : null,
    joinDate: data.joinDate.toISOString().split("T")[0],
    paymentFrequency: data.paymentFrequency,
    baseSalary: Number(data.baseSalary),
    province: data.province,
    employeeCity: data.employeeCity,
    employeeDistrict: data.employeeDistrict,
    employeeVillage: data.employeeVillage,
    postalCode: data.postalCode,
    hasLoginAccount: data.userId != null,
    roleIds: data.user?.roles.map((r) => String(r.id)) ?? [],
    employmentStatus: data.employmentStatus ?? null,
    contractStartDate: data.contractStartDate?.toISOString().split("T")[0] ?? null,
    contractEndDate: data.contractEndDate?.toISOString().split("T")[0] ?? null,
    employmentEndedAt: data.employmentEndedAt?.toISOString().split("T")[0] ?? null,
    endReason: data.endReason ?? null,
  };

  const [departments, positions, roles] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.position.findMany({ orderBy: { name: "asc" } }),
    prisma.role.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Karyawan", href: "/master/karyawan" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Karyawan</h1>
      </div>
      <EmployeeForm
        employee={employee}
        departments={departments}
        positions={positions}
        roles={roles}
      />
    </div>
  );
}
