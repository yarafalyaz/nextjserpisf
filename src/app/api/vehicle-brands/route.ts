import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { parsePagination } from "@/lib/utils/pagination";

export async function GET(request: Request) {
  try {
    if (!(await hasPermission("view_vehicle_brands"))) {
      return apiError("FORBIDDEN", "Tidak memiliki izin");
    }

    const { searchParams } = new URL(request.url);
    const cari = searchParams.get("cari") || undefined;
    // Helper bersama route lain: parseInt per-route memakai default 50 di sini
    // tetapi 100 di activity-logs, dan fallback NaN lokal pernah divergen.
    const { page: halaman, pageSize, skip } = parsePagination({
      halaman: searchParams.get("halaman") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const where = cari ? { name: { contains: cari } } : {};

    const [brands, total] = await Promise.all([
      prisma.vehicleBrand.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.vehicleBrand.count({ where }),
    ]);

    return NextResponse.json({ data: brands, total, page: halaman, pageSize });
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server");
  }
}
