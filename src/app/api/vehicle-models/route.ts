import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";

export async function GET(request: Request) {
  try {
    if (!(await hasPermission("view_vehicles"))) {
      return apiError("FORBIDDEN", "Forbidden");
    }

    const { searchParams } = new URL(request.url);
    const cari = searchParams.get("cari") || undefined;
    const brandId = searchParams.get("brandId");
    const halaman = Math.max(
      1,
      Number.parseInt(searchParams.get("halaman") || "1", 10),
    );
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(searchParams.get("pageSize") || "50", 10)),
    );
    const skip = (halaman - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (cari) where.name = { contains: cari };
    if (brandId) {
      const bid = Number.parseInt(brandId, 10);
      if (Number.isInteger(bid)) where.vehicleBrandId = bid;
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
