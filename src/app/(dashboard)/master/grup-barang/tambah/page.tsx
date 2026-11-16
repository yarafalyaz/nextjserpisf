export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import CreateItemGroupClient from "./_components/create-item-group-client"

export default async function CreateItemGroupPage() {
  await requirePermission("create_item_groups")
  return <CreateItemGroupClient />
}
