export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EditPaymentTermForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPaymentTermPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const paymentTerm = await prisma.paymentTerm.findUnique({
    where: { id: Number(id) },
  })

  if (!paymentTerm) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Termin Pembayaran", href: "/master/payment-terms" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Termin: {paymentTerm.name}</h1>
      </div>
      <EditPaymentTermForm paymentTerm={paymentTerm} />
    </div>
  )
}
