// @ts-nocheck
"use server"

import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"

/**
 * Activity Logger - Records all CRUD operations for audit trail
 */
export async function logActivity(
  action: string,
  modelType: string,
  modelId: number,
  description?: string,
  metadata?: Record<string, any>
) {
  try {
    const session = await auth()
    const userId = session?.user?.id ? Number(session.user.id) : null

    await prisma.$executeRaw`
      INSERT INTO activity_logs (user_id, action, model_type, model_id, description, metadata, created_at)
      VALUES (${userId}, ${action}, ${modelType}, ${modelId}, ${description || null}, ${metadata ? JSON.stringify(metadata) : null}, NOW())
    `
  } catch {
    // Don't throw - logging should never break the main flow
    console.error("Failed to log activity:", { action, modelType, modelId })
  }
}

export async function getActivityLogs(
  modelType?: string,
  modelId?: number,
  limit: number = 50
) {
  const where: any = {}
  if (modelType) where.modelType = modelType
  if (modelId) where.modelId = modelId

  // Using raw query since activity_logs table might not be in Prisma schema yet
  const logs = await prisma.$queryRaw`
    SELECT al.*, u.name as user_name
    FROM activity_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ${modelType ? prisma.$queryRaw`WHERE al.model_type = ${modelType}` : prisma.$queryRaw``}
    ORDER BY al.created_at DESC
    LIMIT ${limit}
  `

  return logs
}
