export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import CreateBarcodeClient from "./_components/create-barcode-client"

export default async function CreateBarcodePage() {
  await requirePermission("create_barcodes")
  return <CreateBarcodeClient />
}
