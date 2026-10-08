"use client"

import { toast } from "sonner"

export function showSuccess(message: string, description?: string) {
  toast.success(message, { description })
}

export function showError(message: string, description?: string) {
  toast.error(message, { description })
}

