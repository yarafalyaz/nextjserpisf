export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ActivityLogTable } from "./_components/activity-log-table"

export default async function ActivityLogPage() {
  await requirePermission("manage_settings")

  const [logs, users, modelTypes, actions] = await Promise.all([
    prisma.$queryRaw<
      {
        id: number
        userId: number | null
        userName: string | null
        action: string
        modelType: string
        modelId: number | null
        description: string | null
        createdAt: Date
        ipAddress: string | null
      }[]
    >`
      SELECT al.id, al.user_id as userId, u.name as userName,
             al.action, al.model_type as modelType, al.model_id as modelId,
             al.description, al.created_at as createdAt, al.ip_address as ipAddress
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT 500
    `,
    prisma.$queryRaw<{ id: number; name: string }[]>`
      SELECT DISTINCT u.id, u.name
      FROM users u
      INNER JOIN activity_logs al ON al.user_id = u.id
      ORDER BY u.name ASC
    `,
    prisma.activityLog.findMany({
      select: { modelType: true },
      distinct: ["modelType"],
      orderBy: { modelType: "asc" },
    }),
    prisma.activityLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    }),
  ])

  const rows = logs.map((log) => ({
    id: log.id,
    userId: log.userId,
    userName: log.userName || "Sistem",
    action: log.action,
    modelType: log.modelType,
    modelId: log.modelId,
    description: log.description || "-",
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
    ipAddress: log.ipAddress || "-",
  }))

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Log Aktivitas" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Log Aktivitas</h1>
        <p className="text-sm text-muted-foreground">
          Riwayat semua perubahan data di sistem
        </p>
      </div>

      <ActivityLogTable
        data={rows}
        users={users}
        modelTypes={modelTypes.map((m) => m.modelType)}
        actions={actions.map((a) => a.action)}
      />
    </div>
  )
}
