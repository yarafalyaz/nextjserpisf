import { prisma } from "@/lib/db/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const brands = await prisma.vehicleBrand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
  return NextResponse.json(brands)
}
