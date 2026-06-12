import { prisma } from "@/lib/db/prisma"
import { hasPermission } from "@/lib/auth/permissions"
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-response"

export async function GET(request: Request) {
  try {
    if (!(await hasPermission("view_vehicles"))) {
      return apiError("FORBIDDEN", "Forbidden")
    }

    const { searchParams } = new URL(request.url)
    const cari = searchParams.get("cari") || undefined
    const halaman = Math.max(1, Number.parseInt(searchParams.get("halaman") || "1", 10))
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("pageSize") || "50", 10)))
    const skip = (halaman - 1) * pageSize

    const where = cari ? { name: { contains: cari } } : {}

    const [brands, total] = await Promise.all([
      prisma.vehicleBrand.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.vehicleBrand.count({ where }),
    ])

    return NextResponse.json({ data: brands, total, page: halaman, pageSize })
  } catch {
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
