"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ==================== VEHICLE BRAND ACTIONS ====================

export async function createVehicleBrand(formData: FormData) {
  await requirePermission("create_vehicle_brands")

  const brand = await prisma.vehicleBrand.create({
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/vehicles/brands")
  return { success: true, id: brand.id }
}

// ==================== VEHICLE MODEL ACTIONS ====================

export async function createVehicleModel(formData: FormData) {
  await requirePermission("create_vehicle_models")

  const model = await prisma.vehicleModel.create({
    data: {
      name: formData.get("name") as string,
      vehicleBrandId: Number(formData.get("brandId")),
    },
  })

  revalidatePath("/vehicles/models")
  return { success: true, id: model.id }
}

// ==================== VEHICLE ACTIONS ====================

export async function createVehicle(formData: FormData) {
  await requirePermission("create_vehicles")

  const modelId = formData.get("modelId") ? Number(formData.get("modelId")) : null

  // Find or create a default variant for the model
  let vehicleVariantId: number | null = null
  if (modelId) {
    const variant = await prisma.vehicleVariant.findFirst({
      where: { vehicleModelId: modelId },
    })
    if (variant) {
      vehicleVariantId = variant.id
    } else {
      // Create a default variant
      const newVariant = await prisma.vehicleVariant.create({
        data: { vehicleModelId: modelId, name: "Standard" },
      })
      vehicleVariantId = newVariant.id
    }
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      plateNumber: formData.get("plateNo") as string,
      vehicleVariantId,
      year: formData.get("year") ? Number(formData.get("year")) : null,
      color: formData.get("color") as string | null,
    },
  })

  // Link to customer if provided
  const customerId = formData.get("customerId") ? Number(formData.get("customerId")) : null
  if (customerId) {
    await prisma.customerVehicle.create({
      data: {
        customerId,
        vehicleId: vehicle.id,
      },
    })
  }

  revalidatePath("/vehicles")
  return { success: true, id: vehicle.id }
}

// ==================== DELETE ACTIONS ====================

export async function deleteVehicleBrand(id: number) {
  await requirePermission("delete_vehicle_brands")

  await prisma.vehicleBrand.delete({ where: { id } })

  revalidatePath("/vehicles/brands")
  return { success: true }
}

export async function deleteVehicleModel(id: number) {
  await requirePermission("delete_vehicle_models")

  await prisma.vehicleModel.delete({ where: { id } })

  revalidatePath("/vehicles/models")
  return { success: true }
}


export async function updateVehicleBrand(id: number, formData: FormData) {
  "use server"

  await requirePermission("create_vehicle_brands")

  const brand = await prisma.vehicleBrand.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/vehicles/brands")
  return { success: true, id: brand.id }
}

export async function updateVehicleModel(id: number, formData: FormData) {
  "use server"

  await requirePermission("create_vehicle_models")

  const model = await prisma.vehicleModel.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      vehicleBrandId: Number(formData.get("brandId")),
    },
  })

  revalidatePath("/vehicles/models")
  return { success: true, id: model.id }
}
export async function updateVehicle(id: number, formData: FormData) {
  "use server"
  await requirePermission("create_vehicles")

  const modelId = formData.get("modelId") ? Number(formData.get("modelId")) : null

  let vehicleVariantId: number | null = null
  if (modelId) {
    const variant = await prisma.vehicleVariant.findFirst({
      where: { vehicleModelId: modelId },
    })
    if (variant) {
      vehicleVariantId = variant.id
    }
  }

  await prisma.vehicle.update({
    where: { id },
    data: {
      plateNumber: formData.get("plateNo") as string,
      vehicleVariantId,
      year: formData.get("year") ? Number(formData.get("year")) : null,
      color: formData.get("color") as string | null,
    },
  })

  revalidatePath("/vehicles")
  return { success: true }
}
// Vehicle delete

export async function deleteVehicle(id: number) {
  "use server"
  await prisma.vehicle.delete({ where: { id } })
  revalidatePath("/vehicles")
  return { success: true }
}
