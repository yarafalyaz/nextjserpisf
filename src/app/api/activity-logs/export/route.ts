import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { buildActivityLogWhere } from "@/lib/utils/activity-log-filter";
import { apiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return apiError("UNAUTHORIZED", "Tidak terotorisasi");

    if (!(await hasPermission("manage_settings"))) {
      return apiError("FORBIDDEN", "Akses ditolak");
    }

    const parsed = buildActivityLogWhere(req.nextUrl.searchParams);
    if (!parsed.ok) return apiError("BAD_REQUEST", parsed.message);
    const where = parsed.where;

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const userIds = Array.from(
      new Set(
        logs.map((l) => l.userId).filter((id): id is number => id != null),
      ),
    );
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const actionLabel: Record<string, string> = {
      CREATE: "Buat",
      create: "Buat",
      UPDATE: "Ubah",
      update: "Ubah",
      DELETE: "Hapus",
      delete: "Hapus",
      LOGIN: "Login",
      login: "Login",
    };

    const header = "Waktu,Pengguna,Aksi,Model,ID,Deskripsi,IP\n";
    const rows = logs
      .map((l) => {
        const d = new Date(l.createdAt).toLocaleString("id-ID");
        const user = l.userId ? (userMap.get(l.userId) ?? "-") : "Sistem";
        const act = actionLabel[l.action] || l.action;

        const esc = (val: unknown) => {
          if (val == null) return "";
          let str = String(val).replace(/"/g, '""');
          if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
          return str;
        };

        return `"${esc(d)}","${esc(user)}","${esc(act)}","${esc(l.modelType)}","${esc(l.modelId)}","${esc(l.description ?? "-")}","${esc(l.ipAddress)}"`;
      })
      .join("\n");

    return new Response(header + rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=log-aktivitas-${Date.now()}.csv`,
      },
    });
  } catch (e) {
    console.error("CSV export error:", e);
    return apiError("INTERNAL_ERROR", "Gagal mengekspor log aktivitas");
  }
}
