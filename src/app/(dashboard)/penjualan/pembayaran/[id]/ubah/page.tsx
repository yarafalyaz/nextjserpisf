/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PaymentForm } from "@/components/forms/payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.salesPayment.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const [invoices, accounts] = await Promise.all([prisma.salesInvoice.findMany({ where: { status: { not: "paid" } }, orderBy: { createdAt: "desc" } }), prisma.account.findMany({ where: { type: "ASSET" }, orderBy: { code: "asc" } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "sales", href: "/penjualan/pembayaran" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <PaymentForm payment={data as any} invoices={invoices as any} accounts={accounts as any}/>
    </div>
  )
}
