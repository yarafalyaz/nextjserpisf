export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import CreateExpenseCategoryClient from "./_components/create-expense-category-client"

export default async function CreateExpenseCategoryPage() {
  await requirePermission("manage_expense_categories")
  return <CreateExpenseCategoryClient />
}
