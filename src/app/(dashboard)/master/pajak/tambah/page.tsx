export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import CreateTaxClient from "./_components/create-tax-client"

export default async function CreateTaxPage() {
  await requirePermission("create_taxes")
  return <CreateTaxClient />
}
