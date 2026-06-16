export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { TicketForm } from "@/components/forms/ticket-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Tickets" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_tickets")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const data = await prisma.crmTicket.findUnique({
    where: { id: numId },
  })

  if (!data) notFound()

  const ticket = {
    id: data.id,
    subject: data.subject,
    description: data.description,
    priority: data.priority,
    status: data.status,
    assignedTo: data.assignedTo,
    ticketNumber: data.ticketNumber ?? undefined,
    customerId: data.customerId,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    type: data.type,
    resolutionNotes: data.resolutionNotes,
  }

  const [customers, users] = await Promise.all([prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }), prisma.user.findMany({ orderBy: { name: "asc" } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "CRM", href: "/crm/tickets" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <TicketForm ticket={ticket} customers={customers} users={users}/>
    </div>
  )
}
