import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@prisma/client"

export async function logActivity(params: {
  userId?: number
  action: string
  modelType: string
  modelId?: number
  description?: string
  oldValues?: any
  newValues?: any
  ipAddress?: string
}) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        modelType: params.modelType,
        modelId: params.modelId,
        description: params.description,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : Prisma.JsonNull,
        newValues: params.newValues ? JSON.stringify(params.newValues) : Prisma.JsonNull,
        ipAddress: params.ipAddress,
      },
    })
  } catch (e) {
    console.error("[ActivityLog]", e)
  }
}
