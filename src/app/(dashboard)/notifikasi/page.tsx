export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requireAuth } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { NotificationsView } from "./_components/notifications-view"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Notifikasi" }

export default async function NotificationsPage() {
  const user = await requireAuth()

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: Number(user.id) },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { userId: Number(user.id), readAt: null } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Notifikasi" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Notifikasi</h1>
      </div>

      <NotificationsView
        initialNotifications={notifications}
        initialUnreadCount={unreadCount}
      />
    </div>
  )
}
