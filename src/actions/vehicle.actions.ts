"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { parseFormData } from "@/lib/validations/parse-form"
import {
  vehicleBrandSchema,
  vehicleModelSchema,
  vehicleVariantSchema,
  vehicleSchema,
  customerVehicleSchema,
} from "@/lib/validations/vehicle.schemas"

// ==================== VEHICLE BRAND ACTIONS ====================

export async function createVehicleBrand(formData: FormData) {
  try {
    await requirePermission("create_vehicle_brands")

    const parsed = parseFormData(vehicleBrandSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    const vehicleBrand = await prisma.vehicleBrand.create({
      data: {
        name: parsed.data.name,
      },
    })

    revalidatePath("/kendaraan/merek")
    await logActivity("create", "VehicleBrand", vehicleBrand.id, "Membuat merek kendaraan")
    return { success: true, id: vehicleBrand.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createVehicleBrand]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal membuat merek kendaraan") }
  }
}

// ==================== VEHICLE MODEL ACTIONS ====================

export async function createVehicleModel(formData: FormData) {
  try {
    await requirePermission("create_vehicle_models")

    const parsed = parseFormData(vehicleModelSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    const { name, brandId } = parsed.data

    const duplicate = await prisma.vehicleModel.findFirst({
      where: { vehicleBrandId: brandId, name },
    })
    if (duplicate) {
      return { success: false, error: `Model "${name}" sudah ada untuk merek ini.` }
    }

    const model = await prisma.vehicleModel.create({
      data: {
        name,
        vehicleBrandId: brandId,
      },
    })

    revalidatePath("/kendaraan/model")
    await logActivity("create", "VehicleModel", model.id, "Membuat model kendaraan")
    return { success: true, id: model.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createVehicleModel]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal membuat model kendaraan") }
  }
}

// ==================== VEHICLE ACTIONS ====================

export async function createVehicle(formData: FormData) {
  try {
    await requirePermission("create_vehicles")

    const parsed = parseFormData(vehicleSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    const { variantId, modelId, plateNo, year, color, customerId } = parsed.data

    let vehicleVariantId: number | null = null

    // Prefer explicit variantId from form
    if (variantId) {
      vehicleVariantId = variantId
    } else if (modelId) {
      // Fallback: pick first variant of selected model (or create "Standard")
      const variant = await prisma.vehicleVariant.findFirst({
        where: { vehicleModelId: modelId },
      })
      if (variant) {
        vehicleVariantId = variant.id
      } else {
        const newVariant = await prisma.vehicleVariant.create({
          data: { vehicleModelId: modelId, name: "Standard" },
        })
        vehicleVariantId = newVariant.id
      }
    }

    const usedVehicleIds = await prisma.vehicle.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    })
    let reusableVehicleId = 1
    for (const v of usedVehicleIds) {
      if (v.id === reusableVehicleId) reusableVehicleId += 1
      else if (v.id > reusableVehicleId) break
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        id: reusableVehicleId,
        plateNumber: plateNo,
        vehicleVariantId,
        year: year ?? null,
        color: color ?? null,
      },
    })

    // Link to customer if provided
    if (customerId) {
      await prisma.customerVehicle.create({
        data: { customerId, vehicleId: vehicle.id },
      })
    }

    revalidatePath("/kendaraan")
    await logActivity("create", "Vehicle", vehicle.id, "Membuat kendaraan")
    return { success: true, id: vehicle.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createVehicle]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal membuat kendaraan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteVehicleBrand(id: number) {
  try {
    await requirePermission("delete_vehicle_brands")

    await prisma.vehicleBrand.delete({ where: { id } })

    revalidatePath("/kendaraan/merek")
    await logActivity("delete", "VehicleBrand", id, "Menghapus merek kendaraan")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteVehicleBrand]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal menghapus merek kendaraan. Pastikan tidak ada model yang masih memakai merek ini.") }
  }
}

export async function deleteVehicleModel(id: number) {
  try {
    await requirePermission("delete_vehicle_models")

    await prisma.vehicleModel.delete({ where: { id } })

    revalidatePath("/kendaraan/model")
    await logActivity("delete", "VehicleModel", id, "Menghapus model kendaraan")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteVehicleModel]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal menghapus model kendaraan") }
  }
}

// ==================== VEHICLE VARIANT ACTIONS ====================

export async function createVehicleVariant(formData: FormData) {
  try {
    await requirePermission("edit_vehicle_models")

    const parsed = parseFormData(vehicleVariantSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    const { name, modelId, drivetrain, transmission } = parsed.data

    const duplicate = await prisma.vehicleVariant.findFirst({
      where: { vehicleModelId: modelId, name },
    })
    if (duplicate) {
      return { success: false, error: `Varian "${name}" sudah ada untuk model ini.` }
    }

    const variant = await prisma.vehicleVariant.create({
      data: {
        vehicleModelId: modelId,
        name,
        drivetrain: drivetrain ?? null,
        transmission: transmission ?? null,
      },
    })

    revalidatePath(`/kendaraan/model/${modelId}/ubah`)
    revalidatePath("/kendaraan/model")
    await logActivity("create", "VehicleVariant", variant.id, "Membuat varian kendaraan")
    return { success: true, id: variant.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createVehicleVariant]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal membuat varian kendaraan") }
  }
}

export async function deleteVehicleVariant(id: number) {
  try {
    await requirePermission("edit_vehicle_models")

    const variant = await prisma.vehicleVariant.findUnique({ where: { id } })
    await prisma.vehicleVariant.delete({ where: { id } })

    if (variant) revalidatePath(`/kendaraan/model/${variant.vehicleModelId}/ubah`)
    revalidatePath("/kendaraan/model")
    await logActivity("delete", "VehicleVariant", id, "Menghapus varian kendaraan")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteVehicleVariant]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal menghapus varian. Pastikan tidak ada kendaraan yang masih memakai varian ini.") }
  }
}

export async function updateVehicleBrand(id: number, formData: FormData) {
  try {
    await requirePermission("edit_vehicle_brands")

    const parsed = parseFormData(vehicleBrandSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    await prisma.vehicleBrand.update({
      where: { id },
      data: {
        name: parsed.data.name,
      },
    })

    revalidatePath("/kendaraan/merek")
    await logActivity("update", "VehicleBrand", id, "Memperbarui merek kendaraan")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateVehicleBrand]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal memperbarui merek kendaraan") }
  }
}

export async function updateVehicleModel(id: number, formData: FormData) {
  try {
    await requirePermission("edit_vehicle_models")

    const parsed = parseFormData(vehicleModelSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    const { name, brandId } = parsed.data

    const duplicate = await prisma.vehicleModel.findFirst({
      where: { vehicleBrandId: brandId, name, NOT: { id } },
    })
    if (duplicate) {
      return { success: false, error: `Model "${name}" sudah ada untuk merek ini.` }
    }

    const model = await prisma.vehicleModel.update({
      where: { id },
      data: {
        name,
        vehicleBrandId: brandId,
      },
    })

    revalidatePath("/kendaraan/model")
    await logActivity("update", "VehicleModel", model.id, "Memperbarui model kendaraan")
    return { success: true, id: model.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateVehicleModel]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal memperbarui model kendaraan") }
  }
}

export async function updateVehicle(id: number, formData: FormData) {
  try {
    await requirePermission("edit_vehicles")

    const parsed = parseFormData(vehicleSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    const { variantId, modelId, plateNo, year, color } = parsed.data

    let vehicleVariantId: number | null = null
    if (variantId) {
      vehicleVariantId = variantId
    } else if (modelId) {
      const variant = await prisma.vehicleVariant.findFirst({
        where: { vehicleModelId: modelId },
      })
      if (variant) vehicleVariantId = variant.id
    }

    await prisma.vehicle.update({
      where: { id },
      data: {
        plateNumber: plateNo,
        vehicleVariantId,
        year: year ?? null,
        color: color ?? null,
      },
    })

    revalidatePath("/kendaraan")
    await logActivity("update", "Vehicle", id, "Memperbarui kendaraan")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateVehicle]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal memperbarui kendaraan") }
  }
}

// Vehicle delete

export async function deleteVehicle(id: number) {
  await requirePermission("delete_vehicles")
  await prisma.vehicle.delete({ where: { id } })
  revalidatePath("/kendaraan")
  await logActivity("delete", "Vehicle", id, "Menghapus kendaraan")
  return { success: true }
}

// ==================== CUSTOMER VEHICLE ACTIONS ====================

export async function createCustomerVehicle(formData: FormData) {
  await requirePermission("create_customers")

  const parsed = parseFormData(customerVehicleSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }

  const {
    customerId,
    variantId,
    vehicleId: formVehicleId,
    kendaraanId,
    licensePlate,
    year,
    color,
    vehicleType,
    transmission,
    chassisNumber,
    engineNumber,
    isActive,
    notes,
  } = parsed.data

  // Find or create Vehicle from variantId
  let vehicleId: number

  if (variantId) {
    // Create a new Vehicle record linked to the variant
    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleVariantId: variantId,
        plateNumber: licensePlate ?? null,
        year: year ?? null,
        color: color ?? null,
      },
    })
    vehicleId = vehicle.id
  } else {
    const rawVehicleId = formVehicleId ?? kendaraanId
    if (!rawVehicleId) {
      return { success: false, error: "vehicleId wajib diisi" }
    }
    vehicleId = rawVehicleId
  }

  const customerVehicle = await prisma.customerVehicle.create({
    data: {
      customerId,
      vehicleId,
      licensePlate: licensePlate ?? null,
      year: year ?? null,
      color: color ?? null,
      vehicleType: vehicleType ?? null,
      transmission: transmission ?? null,
      chassisNumber: chassisNumber ?? null,
      engineNumber: engineNumber ?? null,
      isActive: isActive ?? true,
      notes: notes ?? null,
    },
  })

  revalidatePath(`/master/pelanggan/${customerId}/kendaraan`)
  await logActivity("create", "CustomerVehicle", customerVehicle.id, "Membuat kendaraan pelanggan")
  return { success: true, id: customerVehicle.id }
}

export async function updateCustomerVehicle(id: number, formData: FormData) {
  await requirePermission("edit_customers")

  const parsed = parseFormData(customerVehicleSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }

  const {
    customerId,
    variantId,
    vehicleId: formVehicleId,
    kendaraanId,
    licensePlate,
    year,
    color,
    vehicleType,
    transmission,
    chassisNumber,
    engineNumber,
    isActive,
    notes,
  } = parsed.data

  // Find or create Vehicle from variantId
  let vehicleId: number

  const existing = await prisma.customerVehicle.findUniqueOrThrow({ where: { id } })

  if (variantId) {
    // Update existing vehicle record
    const updatedVehicle = await prisma.vehicle.update({
      where: { id: existing.vehicleId },
      data: {
        vehicleVariantId: variantId,
        plateNumber: licensePlate ?? null,
        year: year ?? null,
        color: color ?? null,
      },
    })
    vehicleId = updatedVehicle.id
  } else {
    const rawVehicleId = formVehicleId ?? kendaraanId
    if (!rawVehicleId) {
      return { success: false, error: "vehicleId wajib diisi" }
    }
    vehicleId = rawVehicleId
  }

  await prisma.customerVehicle.update({
    where: { id },
    data: {
      vehicleId,
      licensePlate: licensePlate ?? null,
      year: year ?? null,
      color: color ?? null,
      vehicleType: vehicleType ?? null,
      transmission: transmission ?? null,
      chassisNumber: chassisNumber ?? null,
      engineNumber: engineNumber ?? null,
      isActive: isActive ?? true,
      notes: notes ?? null,
    },
  })

  revalidatePath(`/master/pelanggan/${customerId}/kendaraan`)
  await logActivity("update", "CustomerVehicle", id, "Memperbarui kendaraan pelanggan")
  return { success: true }
}

export async function deleteCustomerVehicle(id: number) {
  await requirePermission("delete_customers")

  const vehicle = await prisma.customerVehicle.findUniqueOrThrow({
    where: { id },
  })

  await prisma.customerVehicle.delete({
    where: { id },
  })

  revalidatePath(`/master/pelanggan/${vehicle.customerId}/kendaraan`)
  await logActivity("delete", "CustomerVehicle", id, "Menghapus kendaraan pelanggan")
  return { success: true }
}
