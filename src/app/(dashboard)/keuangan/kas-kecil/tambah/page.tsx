export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PettyCashForm } from "@/components/forms/petty-cash-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Kas Kecil" }

export default async function CreatePettyCashPage() {
  await requirePermission("create_petty_cash")

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Transaksi Kas Kecil</h1>
      </div>
      <PettyCashForm accounts={accounts} />
    </div>
  )
}
