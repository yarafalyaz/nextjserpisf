export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"

export default function DokumenPajakIndexPage() {
  redirect("/keuangan/dokumen-pajak/faktur")
}
