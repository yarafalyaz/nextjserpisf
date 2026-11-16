export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import CreateItemCategoryClient from "./_components/create-item-category-client"

export default async function CreateItemCategoryPage() {
  await requirePermission("create_item_categories")
  return <CreateItemCategoryClient />
}
