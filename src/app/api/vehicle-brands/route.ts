import { prisma } from "@/lib/db/prisma"
import { hasPermission } from "@/lib/auth/permissions"
import { NextResponse } from "next/server"

export async function GET() {
  if (!(await hasPermission("view_vehicles"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const brands = await prisma.vehicleBrand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
  return NextResponse.json(brands)
}
