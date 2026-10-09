import { redirect } from "next/navigation"

// Brands and models are now shown together on /kendaraan/merek. Keep this path
// working for old bookmarks/links by redirecting instead of 404-ing.
export default function VehicleModelsRedirect() {
  redirect("/kendaraan/merek")
}
