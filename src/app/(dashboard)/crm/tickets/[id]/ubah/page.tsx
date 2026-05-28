export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { TicketForm } from "@/components/forms/ticket-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.crmTicket.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const [customers, users] = await Promise.all([prisma.customer.findMany({ orderBy: { name: "asc" } }), prisma.user.findMany({ orderBy: { name: "asc" } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "crm", href: "/crm/tickets" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <TicketForm ticket={data as any} customers={customers as any} users={users as any}/>
    </div>
  )
}
