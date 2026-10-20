import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { parsePagination } from "@/lib/utils/pagination";

export async function GET(request: Request) {
  try {
    if (!(await hasPermission("view_vehicle_models"))) {
      return apiError("FORBIDDEN", "Tidak memiliki izin");
    }

    const { searchParams } = new URL(request.url);
    const cari = searchParams.get("cari") || undefined;
    const brandId = searchParams.get("brandId");
    const { page: halaman, pageSize, skip } = parsePagination({
      halaman: searchParams.get("halaman") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const where: Record<string, unknown> = {};
    if (cari) where.name = { contains: cari };
    if (brandId !== null) {
      if (!/^\d+$/.test(brandId)) {
        return apiError("BAD_REQUEST", "brandId tidak valid");
      }
      const bid = Number(brandId);
      if (!Number.isSafeInteger(bid) || bid <= 0) {
        return apiError("BAD_REQUEST", "brandId tidak valid");
      }
      where.vehicleBrandId = bid;
    }

    const [models, total] = await Promise.all([
      prisma.vehicleModel.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: "asc" },
        select: { id: true, name: true, vehicleBrandId: true },
      }),
      prisma.vehicleModel.count({ where }),
    ]);

    return NextResponse.json({ data: models, total, page: halaman, pageSize });
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server");
  }
}
