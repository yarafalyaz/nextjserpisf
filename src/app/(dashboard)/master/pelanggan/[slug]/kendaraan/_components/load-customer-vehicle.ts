import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { resolveEntity } from "@/lib/utils/resolve-entity"

const cvInclude = {
  vehicle: {
    include: {
      variant: {
        include: {
          model: {
            include: { brand: true },
          },
        },
      },
    },
  },
} as const

export async function loadCustomerBySlug(slug: string) {
  const customer = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.customer.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.customer.findUnique({ where: { id, ...where } }),
    },
  )

  if (!customer) notFound()

  const customerId = customer.id
  const customerKey = customer.slug ?? customer.id

  return { customer, customerId, customerKey }
}

export async function loadCustomerVehicleContext(slug: string, vehicleSlug: string) {
  const { customer, customerId, customerKey } = await loadCustomerBySlug(slug)

  // Slug lebih dulu; id numerik tetap diterima untuk tautan lama. Cakupannya
  // dibatasi ke pelanggan di slug induk, supaya satu unit tidak bisa dibuka
  // lewat pelanggan lain.
  const cv = await resolveEntity(
    { segment: vehicleSlug, fallbackWhere: { customerId: customer.id } },
    {
      bySlug: (s, where) => prisma.customerVehicle.findFirst({ where: { slug: s, ...where }, include: cvInclude }),
      byId: (id, where) => prisma.customerVehicle.findFirst({ where: { id, ...where }, include: cvInclude }),
    },
  )

  if (!cv || cv.customerId !== customerId) notFound()

  return { customer, customerId, customerKey, cv }
}
