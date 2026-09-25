import type { Metadata } from "next"
import { requirePermission } from "@/lib/auth/permissions"

export const metadata: Metadata = { title: "Tambah Pajak" }

/**
 * Guard the create form before it renders.
 *
 * The page in this folder is a client component and cannot call
 * requirePermission itself: without this layout a user missing `create_taxes` would be
 * shown the whole form (fields and lookups) and only be rejected - with an opaque
 * error - when the server action refused the submit. requirePermission redirects
 * them to "/" instead.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission("create_taxes")
  return children
}
