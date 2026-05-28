export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { DownPaymentForm } from "@/components/forms/down-payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.downPayment.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const [customers, quotations] = await Promise.all([prisma.customer.findMany({ orderBy: { name: "asc" } }), prisma.quotation.findMany({ where: { status: "approved" }, orderBy: { createdAt: "desc" } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "sales", href: "/penjualan/uang-muka" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit</h1>
      </div>
      <DownPaymentForm downPayment={data as any} customers={customers as any} quotations={quotations as any}/>
    </div>
  )
}
