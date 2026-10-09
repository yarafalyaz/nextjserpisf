export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { renderCreatePurchaseOrder } from "../_render"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pesanan" }

export default async function CreatePurchaseOrderFromRequestPage({
  params,
}: {
  params: Promise<{ prId: string }>
}) {
  await requirePermission("create_purchase_orders")

  const { prId } = await params

  return renderCreatePurchaseOrder(prId)
}
