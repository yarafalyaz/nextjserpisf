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

      <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-5" style={{ gridTemplateColumns: "1fr" }}>
        {notifications.length === 0 ? (
          <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada notifikasi</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className="bg-surface rounded-xl border border-default shadow-sm p-6"
              style={{
                padding: "16px 20px",
                borderLeft: !n.readAt ? "3px solid var(--color-primary)" : "3px solid transparent",
                opacity: n.readAt ? 0.7 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{n.title}</span>
                    {!n.readAt && <span className="notification-badge" style={{ position: "static", width: "6px", height: "6px" }} />}
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>{n.body}</p>
                </div>
                <span className="text-muted" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
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
