export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import ScanItemClient from "./_components/scan-item-client"

export default async function ScanItemPage() {
  await requirePermission("view_items")
  return <ScanItemClient />
}
