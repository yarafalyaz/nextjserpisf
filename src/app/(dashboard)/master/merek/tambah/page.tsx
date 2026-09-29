export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import CreateBrandForm from "./_form"

export default async function CreateBrandPage() {
  await requirePermission("create_brands")

  const categories = await prisma.itemCategory.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return <CreateBrandForm categories={categories} />
}
