export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import CreatePaymentTermClient from "./_components/create-payment-term-client"

export default async function CreatePaymentTermPage() {
  await requirePermission("create_payment_terms")
  return <CreatePaymentTermClient />
}
