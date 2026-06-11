"use client"

import { Header } from "@/components/layout/header"

interface SiteHeaderProps {
  companyLogo?: string
}

export function SiteHeader({ companyLogo }: SiteHeaderProps) {
  return <Header companyLogo={companyLogo} />
}
