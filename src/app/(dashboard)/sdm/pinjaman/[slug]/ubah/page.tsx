export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EmployeeLoanForm } from "@/components/forms/employee-loan-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrEmployeeScopeWhere, hrScopeWhere } from "@/lib/auth/hr-scope"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Pinjaman" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("create_loans")
  const scope = await getHrScope(user)

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: hrScopeWhere(scope) },
    {
      bySlug: (s, where) => prisma.employeeLoan.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.employeeLoan.findUnique({ where: { id, ...where } }),
    },
  )

  if (!data) notFound()

  const employees = await prisma.employee.findMany({ where: { ...hrEmployeeScopeWhere(scope), deletedAt: null }, orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pinjaman", href: "/sdm/pinjaman" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <EmployeeLoanForm loan={{ id: data.id, employeeId: data.employeeId, loanDate: data.loanDate.toISOString().split('T')[0], totalAmount: Number(data.totalAmount), monthlyInstallment: Number(data.monthlyInstallment), weeklyInstallment: data.weeklyInstallment === null ? null : Number(data.weeklyInstallment), remainingAmount: Number(data.remainingAmount), status: data.status, notes: data.notes }} employees={employees}/>
    </div>
  )
}
