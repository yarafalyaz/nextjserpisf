export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import CreateBankClient from "./_components/create-bank-client"

export default async function CreateBankPage() {
  await requirePermission("create_banks")
  return <CreateBankClient />
}
