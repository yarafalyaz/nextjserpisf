export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ReimbursementClaimForm } from "@/components/forms/reimbursement-claim-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ajukan Klaim Reimbursement" }

export default async function CreateReimbursementClaimPage() {
  await requirePermission("create_employee_reimbursements")

  const [categories, projects] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true },
    }),
    prisma.project.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, documentNo: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ajukan Klaim Reimbursement</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Klaim diajukan atas nama Anda. Akun beban ditetapkan oleh keuangan saat verifikasi —
        Anda tidak perlu memilih akun.
      </p>
      <ReimbursementClaimForm categories={categories} projects={projects} />
    </div>
  )
}
