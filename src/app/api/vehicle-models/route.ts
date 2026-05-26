import { prisma } from "@/lib/db/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const models = await prisma.vehicleModel.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, vehicleBrandId: true },
  })
  return NextResponse.json(models)
}
