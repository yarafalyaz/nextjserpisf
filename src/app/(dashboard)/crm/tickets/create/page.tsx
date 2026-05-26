export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { TicketForm } from "@/components/forms/ticket-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateTicketPage() {
  await requirePermission("create_tickets")

  const [customers, users] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Tickets", href: "/crm/tickets" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Ticket</h1>
      </div>
      <TicketForm customers={customers} users={users} />
    </div>
  )
}
