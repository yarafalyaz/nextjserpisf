
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
  metadata?: Record<string, unknown>
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
  // Fix #42: Prisma tagged template literals cannot be concatenated/nested
  // Use separate queries based on filter conditions
  if (modelType && modelId) {
    return prisma.$queryRaw`
      SELECT al.*, u.name as user_name
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.model_type = ${modelType} AND al.model_id = ${modelId}
      ORDER BY al.created_at DESC
      LIMIT ${limit}
    `
  } else if (modelType) {
    return prisma.$queryRaw`
      SELECT al.*, u.name as user_name
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.model_type = ${modelType}
      ORDER BY al.created_at DESC
      LIMIT ${limit}
    `
  } else {
    return prisma.$queryRaw`
      SELECT al.*, u.name as user_name
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT ${limit}
    `
  }
}
