import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { parsePagination } from "@/lib/utils/pagination";
import { buildActivityLogWhere } from "@/lib/utils/activity-log-filter";
import { apiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return apiError("UNAUTHORIZED", "Tidak terotorisasi");

    // Izin sama dengan halaman /pengaturan/log-aktivitas (lihat sensitive-routes.ts).
    if (!(await hasPermission("manage_settings"))) {
      return apiError(
        "FORBIDDEN",
        "Anda tidak memiliki izin untuk melihat log aktivitas",
      );
    }

    const sp = req.nextUrl.searchParams;
    const { page, pageSize, skip, take } = parsePagination({
      halaman: sp.get("halaman") ?? undefined,
      pageSize: sp.get("pageSize") ?? undefined,
    });

    const parsed = buildActivityLogWhere(sp);
    if (!parsed.ok) return apiError("BAD_REQUEST", parsed.message);
    const where = parsed.where;

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        // Hanya kolom kontrak: oldValues/newValues dimuat sebatas untuk
        // flag hasChanges, dan metadata (String @db.Text) tidak pernah
        // dipakai respons — jangan muat blob sensitif itu per baris.
        select: {
          id: true,
          userId: true,
          action: true,
          modelType: true,
          modelId: true,
          description: true,
          createdAt: true,
          ipAddress: true,
          oldValues: true,
          newValues: true,
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    // Hydrate user names in one query
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

    return NextResponse.json({
      data: logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        userName: log.userId
          ? (userMap.get(log.userId) ?? "Pengguna")
          : "Sistem",
        action: log.action,
        modelType: log.modelType,
        modelId: log.modelId,
        description: log.description ?? "-",
        createdAt: log.createdAt.toISOString(),
        ipAddress: log.ipAddress ?? "-",
        // Sanitize: oldValues/newValues may contain sensitive data (salary, bank,
        // password hashes). Only expose field names, not full values.
        hasChanges: !!(log.oldValues || log.newValues),
      })),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    console.error("Activity logs API error:", e);
    return apiError("INTERNAL_ERROR", "Gagal memuat log aktivitas");
  }
}
