"use client"

import { BrandForm } from "../../_components/brand-form"

interface BrandEditFormProps {
  brand: { id: number; name: string; description: string | null }
  allCategories: { id: number; name: string }[]
  initialCategories: { id: number; name: string }[]
}

export function BrandEditForm({ brand, allCategories, initialCategories }: BrandEditFormProps) {
  return <BrandForm categories={allCategories} brand={brand} initialCategories={initialCategories} />
}
