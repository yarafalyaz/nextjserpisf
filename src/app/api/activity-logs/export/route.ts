import { type NextRequest } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user)
      return new Response("Unauthorized", { status: 401 })

    if (!(await hasPermission("manage_settings"))) {
      return new Response("Forbidden", { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const where: Record<string, unknown> = {}

    const userId = sp.get("userId")
    const action = sp.get("action")
    const modelType = sp.get("modelType")
    const dateFrom = sp.get("dateFrom")
    const dateTo = sp.get("dateTo")
    const search = sp.get("cari")

    if (userId && userId !== "all") where.userId = Number.parseInt(userId, 10)
    if (action && action !== "all") where.action = action
    if (modelType && modelType !== "all") where.modelType = modelType
    if (dateFrom || dateTo) {
      where.createdAt = {}
      const w = where.createdAt as Record<string, Date>
      if (dateFrom) w.gte = new Date(dateFrom)
      if (dateTo) {
        const d = new Date(dateTo)
        d.setHours(23, 59, 59, 999)
        w.lte = d
      }
    }
    if (search) where.description = { contains: search }

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
    })

    const userIds = Array.from(
      new Set(logs.map((l) => l.userId).filter((id): id is number => id != null)),
    )
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : []
    const userMap = new Map(users.map((u) => [u.id, u.name]))

    const actionLabel: Record<string, string> = {
      CREATE: "Buat", create: "Buat",
      UPDATE: "Ubah", update: "Ubah",
      DELETE: "Hapus", delete: "Hapus",
      LOGIN: "Login", login: "Login",
    }

    const header = "Waktu,Pengguna,Aksi,Model,ID,Deskripsi,IP\n"
    const rows = logs
      .map((l) => {
        const d = new Date(l.createdAt).toLocaleString("id-ID")
        const user = l.userId ? (userMap.get(l.userId) ?? "-") : "Sistem"
        const act = actionLabel[l.action] || l.action
        const desc = (l.description ?? "-").replace(/"/g, '""')
        return `"${d}","${user}","${act}","${l.modelType}","${l.modelId ?? ""}","${desc}","${l.ipAddress ?? ""}"`
      })
      .join("\n")

    return new Response(header + rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=log-aktivitas-${Date.now()}.csv`,
      },
    })
  } catch (e) {
    console.error("CSV export error:", e)
    return new Response("Gagal export", { status: 500 })
  }
}
