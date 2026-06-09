export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EmployeeLoanForm } from "@/components/forms/employee-loan-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Pinjaman" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.employeeLoan.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const employees = await prisma.employee.findMany({ orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "SDM", href: "/sdm/pinjaman" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <EmployeeLoanForm loan={{ id: data.id, employeeId: data.employeeId, loanDate: data.loanDate.toISOString().split('T')[0], totalAmount: Number(data.totalAmount), monthlyInstallment: Number(data.monthlyInstallment), remainingAmount: Number(data.remainingAmount), status: data.status, notes: data.notes }} employees={employees}/>
    </div>
  )
}
