export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function NotificationsPage() {
  const session = await auth()
  if (!session?.user) return null

  const notifications = await prisma.notification.findMany({
    where: { userId: Number(session.user.id) },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const unread = notifications.filter((n) => !n.readAt)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Notifications" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        <span className="text-muted">{unread.length} belum dibaca</span>
      </div>

      <div className="grid grid-cols-1 gap-5">
        {notifications.length === 0 ? (
          <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada notifikasi</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`bg-surface rounded-xl border border-default shadow-sm px-5 py-4 border-l-3 ${!n.readAt ? "border-l-primary" : "border-l-transparent"} ${n.readAt ? "opacity-70" : ""}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[0.9375rem] font-semibold">{n.title}</span>
                    {!n.readAt && <span className="notification-badge static w-1.5 h-1.5" />}
                  </div>
                  <p className="text-[0.8125rem] text-secondary m-0">{n.body}</p>
                </div>
                <span className="text-muted text-xs whitespace-nowrap">
                  {formatDate(n.createdAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
