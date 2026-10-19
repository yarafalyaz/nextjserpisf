import { prisma } from "@/lib/db/prisma"

export async function loadBomRevisionFormData() {
  const [products, items] = await Promise.all([
    prisma.product.findMany({
      where: {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, sku: true, name: true, unitOfMeasure: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
  ])
  return { products, items }
}
