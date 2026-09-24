export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { WorkOrderForm } from "@/components/forms/work-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"
import { toLocalDateOnly } from "@/lib/utils/date-only"

export const metadata: Metadata = { title: "Tambah Perintah Kerja" }

export default async function CreateWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ quotationId?: string }>
}) {
  await requirePermission("create_work_orders")
  const params = await searchParams
  const quotationId = params.quotationId ? Number(params.quotationId) : undefined

  const [customers, items, products] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, cost: true, qtyOnHand: true, minStock: true, unitOfMeasure: true },
    }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      include: { materials: true },
    }),
  ])

  // Pre-fill from quotation if provided
  let quotation = null
  if (quotationId) {
    quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        customer: true,
        sections: {
          include: {
            items: true,
          },
        },
      },
    })
  }

  const defaultItems = quotation?.sections
    ?.flatMap((s) => s.items)
    .filter((it) => it.itemId !== null || (it.description && it.description.trim() !== ""))
    .map((it) => {
      const catalogItem = items.find((x) => x.id === it.itemId)
      let resolvedItemId = it.itemId || 0

      // If it has no itemId (BOM product / custom item), try to resolve it from the items catalog by SKU or name
      if (!it.itemId && it.description) {
        const desc = it.description.toLowerCase()
        const matchedCatalogItem = items.find(
          (x) =>
            desc.includes(x.sku.toLowerCase()) ||
            desc.includes(x.name.toLowerCase())
        )
        if (matchedCatalogItem) {
          resolvedItemId = matchedCatalogItem.id
        }
      }

      const cost = catalogItem
        ? Number(catalogItem.cost)
        : (resolvedItemId > 0
            ? Number(items.find((x) => x.id === resolvedItemId)?.cost || 0)
            : Number(it.unitPrice))

      return {
        itemId: resolvedItemId,
        qty: Number(it.qty),
        cost: cost,
        description: it.description || "",
        status: "pending",
      }
    }) || []

  // ─── Generate defaultNotes with BOM breakdown & stock check ─────────
  let defaultNotes = ""
  let defaultStartDate = ""
  let defaultEndDate = ""

  if (quotation) {
    // Look up the project associated with this customer (or quotation)
    const project = quotation.projectId
      ? await prisma.project.findUnique({ where: { id: quotation.projectId } })
      : await prisma.project.findFirst({
          where: { customerId: quotation.customerId, status: "active" },
          orderBy: { createdAt: "desc" },
        })

    const customerName = quotation.customer?.name ?? "-"
    const projectName = project?.name ?? `Projek ${customerName}`
    const today = toLocalDateOnly(new Date())

    // Use project dates if available
    if (project?.startDate) {
      defaultStartDate = project.startDate.toISOString().split("T")[0]
    }
    if (project?.endDate) {
      defaultEndDate = project.endDate.toISOString().split("T")[0]
    }

    const fmtDate = (d: string) => {
      const [y, m, day] = d.split("-")
      return `${day}/${m}/${y}`
    }

    // Header: project info
    let notes = `[INFORMASI PROYEK]\n`
    notes += `Nama Proyek  : ${projectName}\n`
    notes += `Pelanggan    : ${customerName}\n`
    notes += `Tanggal Mulai: ${defaultStartDate ? fmtDate(defaultStartDate) : fmtDate(today)}\n`
    notes += `Tanggal Selesai: ${defaultEndDate ? fmtDate(defaultEndDate) : "-"}\n`

    // Build stock lookup map
    const stockById = new Map(items.map((it) => [it.id, it]))

    // Flatten all quotation items
    const allQItems = quotation.sections.flatMap((s) =>
      s.items.map((item) => ({
        itemId: item.itemId,
        description: item.description ?? "",
        qty: Number(item.qty),
      }))
    )

    // Build BOM breakdown
    notes += `\n[DAFTAR ITEM PERINTAH KERJA]\n`

    for (const qItem of allQItems) {
      const desc = qItem.description.trim()
      if (!desc) continue

      // Try to match a product (BOM) by description
      const matchedProduct = products.find((p) => {
        const pName = p.name.toLowerCase()
        const pCode = (p.code ?? "").toLowerCase()
        const d = desc.toLowerCase()
        return d.includes(pName) || d.includes(pCode) || pName.includes(d)
      })

      if (matchedProduct && matchedProduct.materials.length > 0) {
        // This is a BOM product — show breakdown
        notes += `\n● ${desc} (Qty: ${qItem.qty})\n`
        notes += `  Breakdown Material:\n`

        for (const mat of matchedProduct.materials) {
          const stockItem = stockById.get(mat.itemId)
          const matName = stockItem?.name ?? `Item #${mat.itemId}`
          const uom = stockItem?.unitOfMeasure ?? "PCS"
          const qtyNeeded = Number(mat.qty) * qItem.qty
          const stock = stockItem ? Number(stockItem.qtyOnHand) : 0
          const minStock = stockItem ? Number(stockItem.minStock) : 0

          let statusLabel: string
          if (stock <= 0) {
            statusLabel = "Habis"
          } else if (stock < qtyNeeded || stock <= minStock) {
            statusLabel = `Tinggal sedikit (Stok: ${stock} ${uom})`
          } else {
            statusLabel = `Stok ada (Stok: ${stock} ${uom})`
          }

          notes += `  - ${matName}: Butuh ${qtyNeeded} ${uom} → ${statusLabel}\n`
        }
      } else if (qItem.itemId) {
        // Direct item (non-BOM) — show stock status
        const stockItem = stockById.get(qItem.itemId)
        if (stockItem) {
          const stock = Number(stockItem.qtyOnHand)
          const uom = stockItem.unitOfMeasure
          const minStockVal = Number(stockItem.minStock)
          let statusLabel: string
          if (stock <= 0) {
            statusLabel = "Habis"
          } else if (stock < qItem.qty || stock <= minStockVal) {
            statusLabel = `Tinggal sedikit (Stok: ${stock} ${uom})`
          } else {
            statusLabel = `Stok ada (Stok: ${stock} ${uom})`
          }
          notes += `● ${desc} (Qty: ${qItem.qty}) → ${statusLabel}\n`
        } else {
          notes += `● ${desc} (Qty: ${qItem.qty})\n`
        }
      } else {
        // Custom / service item — just list it
        notes += `● ${desc} (Qty: ${qItem.qty})\n`
      }
    }

    defaultNotes = notes.trim()
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi" },
  { label: "Perintah Kerja", href: "/produksi/perintah-kerja" },
  { label: "Tambah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Perintah Kerja</h1>
      </div>
      <WorkOrderForm
        customers={customers}
        items={JSON.parse(JSON.stringify(items))}
        quotationId={quotationId}
        defaultCustomerId={quotation?.customerId}
        defaultItems={defaultItems}
        defaultNotes={defaultNotes}
        defaultStartDate={defaultStartDate}
        defaultEndDate={defaultEndDate}
      />
    </div>
  )
}
