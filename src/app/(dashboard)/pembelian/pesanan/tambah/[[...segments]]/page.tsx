export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { renderCreatePurchaseOrder } from "../_render"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pesanan" }

const prHref = (slug: string) => `/pembelian/pesanan/tambah/pr/${slug}`

export default async function CreatePurchaseOrderPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ prId?: string }>
}) {
  await requirePermission("create_purchase_orders")

  const { prId } = await searchParams
  const { segments } = await routeParams

  // Tautan lama `?prId=<id>` → bentuk path `pr/<slug>`.
  if (!segments?.length && prId !== undefined) {
    await redirectLegacyPrefillQuery(prisma.purchaseRequest, prId, prHref, "/pembelian/pesanan/tambah")
  }

  // Tautan lama `/tambah/<slug|id>` (segmen telanjang sebelum pola
  // kunci/nilai) → `pr/<slug>`.
  if (segments?.length === 1) {
    await resolvePrefillId(prisma.purchaseRequest, segments[0], prHref)
    redirect(prHref(segments[0]))
  }

  const seg = parsePrefillSegments(segments, ["pr"])
  if (seg.pr) {
    const resolvedPrId = await resolvePrefillId(prisma.purchaseRequest, seg.pr, prHref)
    return renderCreatePurchaseOrder(String(resolvedPrId))
  }

  return renderCreatePurchaseOrder()
}
