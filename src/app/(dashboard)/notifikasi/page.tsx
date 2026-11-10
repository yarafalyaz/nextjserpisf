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
    <div className="flex flex-col gap-6 max-w-5xl">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Notifikasi" },
        ]}
      />

      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pb-2 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Notifikasi</h1>
          <p className="text-sm text-muted-foreground">
            Kelola seluruh pemberitahuan, aktivitas sistem, dan permohonan persetujuan Anda
          </p>
        </div>
      </div>

      <NotificationsView
        initialNotifications={notifications}
        initialUnreadCount={unreadCount}
      />
    </div>
  )
}
