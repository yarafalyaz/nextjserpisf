import { prisma } from "@/lib/db/prisma"
import type { Prisma } from "@prisma/client"

interface LogActivityParams {
  userId?: number
  action: string
  modelType: string
  modelId?: number
  description?: string
  oldValues?: Prisma.InputJsonValue
  newValues?: Prisma.InputJsonValue
  ipAddress?: string
}

export async function logActivity(params: LogActivityParams) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        modelType: params.modelType,
        modelId: params.modelId ?? null,
        description: params.description ?? null,
        oldValues: params.oldValues ?? undefined,
        newValues: params.newValues ?? undefined,
        ipAddress: params.ipAddress ?? null,
      },
    })
  } catch (error) {
    // Don't throw - logging should never break the main flow
    console.error("[ActivityLog] Failed to log activity:", error)
  }
}
