"use client"

import { BrandForm } from "../_components/brand-form"

interface CreateBrandFormProps {
  categories: { id: number; name: string }[]
}

export default function CreateBrandForm({ categories }: CreateBrandFormProps) {
  return <BrandForm categories={categories} />
}
