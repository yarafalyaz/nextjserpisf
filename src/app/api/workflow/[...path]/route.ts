import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

const MODULE_MAP: Record<string, { model: string; revalidate: string }> = {
  "sales/quotations": { model: "quotation", revalidate: "/sales/quotations" },
  "sales/orders": { model: "salesOrder", revalidate: "/sales/orders" },
  "sales/invoices": { model: "salesInvoice", revalidate: "/sales/invoices" },
  "purchase/requests": { model: "purchaseRequest", revalidate: "/purchase/requests" },
  "purchase/orders": { model: "purchaseOrder", revalidate: "/purchase/orders" },
  "purchase/bills": { model: "vendorBill", revalidate: "/purchase/bills" },
  "hrm/leave": { model: "leaveRequest", revalidate: "/hrm/leave" },
  "hrm/overtime": { model: "overtimeRequest", revalidate: "/hrm/overtime" },
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  // path = ["sales", "quotations", "123", "approve"]
  const action = path[path.length - 1] // "approve" or "reject"
  const id = Number(path[path.length - 2])
  const module = path.slice(0, path.length - 2).join("/")

  const config = MODULE_MAP[module]
  if (!config) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 })
  }

  const newStatus = action === "approve" ? "approved" : "rejected"

  try {
    await (prisma as any)[config.model].update({
      where: { id },
      data: { status: newStatus },
    })

    revalidatePath(config.revalidate)
    return NextResponse.json({ success: true, status: newStatus })
  } catch (error) {
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 })
  }
}
