export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { renderCreatePurchaseOrder } from "./_render"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pesanan" }

export default async function CreatePurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ prId?: string }>
}) {
  await requirePermission("create_purchase_orders")

  // Backward compatibility: the old link used ?prId=<id>. Permanently move it
  // to the cleaner /tambah/<id> path so bookmarks keep working.
  const { prId } = await searchParams
  if (prId) redirect(`/pembelian/pesanan/tambah/${prId}`)

  return renderCreatePurchaseOrder()
}
