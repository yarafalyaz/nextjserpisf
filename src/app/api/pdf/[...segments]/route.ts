import { GET as handlePdfGet } from "../route"
import { auth } from "@/lib/auth/auth"
import { apiError } from "@/lib/api-response"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }
  return handlePdfGet(request)
}

