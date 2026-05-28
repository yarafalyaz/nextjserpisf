export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { PayrollForm } from "@/components/forms/payroll-form"
import { PageHeader, BackButton } from "@/components/ui/page-header"

export default async function EditPayrollPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("update_payroll")
  
  const { id } = await params
  const numId = Number(id)
  if (isNaN(numId)) notFound()

  const payroll = await prisma.payroll.findUnique({
    where: { id: numId }
  })

  if (!payroll) notFound()
  if (payroll.status !== "draft") {
    // Only draft payrolls can be edited
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Ubah Payroll"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "HRM", href: "/sdm" },
            { label: "Penggajian", href: "/sdm/penggajian" },
            { label: "Ubah" },
          ]}
          actions={<BackButton href={`/sdm/penggajian/${id}`} />}
        />
        <div className="p-6 bg-danger/10 border border-danger/20 rounded-xl text-danger">
          Hanya payroll dengan status <strong>Draft</strong> yang dapat diubah.
        </div>
      </div>
    )
  }

  const employees = await prisma.employee.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true }
  })

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <PageHeader
        title={`Ubah Payroll: ${payroll.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "HRM", href: "/sdm" },
          { label: "Penggajian", href: "/sdm/penggajian" },
          { label: payroll.documentNo, href: `/sdm/penggajian/${payroll.id}` },
          { label: "Ubah" },
        ]}
      />

      <PayrollForm employees={employees} initialData={payroll} />
    </div>
  )
}
