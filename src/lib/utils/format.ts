/**
 * Formatting helpers for YaraERP.
 * Currency (IDR), dates, numbers, and percentages.
 */

/**
 * Format a number as Indonesian Rupiah currency.
 * Example: 1500000 → "Rp 1.500.000"
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options?: {
    symbol?: string
    decimals?: number
    showSymbol?: boolean
  }
): string {
  const {
    symbol = 'Rp ',
    decimals = 0,
    showSymbol = true,
  } = options ?? {}

  const numericAmount = Number(amount ?? 0)

  if (isNaN(numericAmount)) return showSymbol ? `${symbol}0` : '0'

  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numericAmount)

  return showSymbol ? `${symbol}${formatted}` : formatted
}

/**
 * Format a number with Indonesian locale (dot as thousands separator).
 * Example: 1500000.5 → "1.500.000,5"
 */
export function formatNumber(
  value: number | string | null | undefined,
  decimals: number = 0
): string {
  const numericValue = Number(value ?? 0)

  if (isNaN(numericValue)) return '0'

  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numericValue)
}

/**
 * Format a date to Indonesian locale string.
 * Example: "2024-01-15" → "15 Januari 2024"
 */
export function formatDate(
  date: Date | string | null | undefined,
  options?: {
    format?: 'short' | 'long' | 'numeric'
    includeTime?: boolean
  }
): string {
  if (!date) return '-'

  const { format = 'long', includeTime = false } = options ?? {}

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (isNaN(dateObj.getTime())) return '-'

  const dateOptions: Intl.DateTimeFormatOptions = (() => {
    switch (format) {
      case 'short':
        return { day: '2-digit', month: 'short', year: 'numeric' } as const
      case 'numeric':
        return { day: '2-digit', month: '2-digit', year: 'numeric' } as const
      case 'long':
      default:
        return { day: 'numeric', month: 'long', year: 'numeric' } as const
    }
  })()

  if (includeTime) {
    dateOptions.hour = '2-digit'
    dateOptions.minute = '2-digit'
  }

  return new Intl.DateTimeFormat('id-ID', dateOptions).format(dateObj)
}

/**
 * Format a date to relative time string.
 * Example: "2 jam yang lalu", "3 hari yang lalu"
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '-'

  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (isNaN(dateObj.getTime())) return '-'

  const now = new Date()
  const diffMs = now.getTime() - dateObj.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return 'Baru saja'
  if (diffMinutes < 60) return `${diffMinutes} menit yang lalu`
  if (diffHours < 24) return `${diffHours} jam yang lalu`
  if (diffDays < 7) return `${diffDays} hari yang lalu`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} minggu yang lalu`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} bulan yang lalu`
  return `${Math.floor(diffDays / 365)} tahun yang lalu`
}

/**
 * Format a percentage value.
 * Example: 0.115 → "11,5%"
 */
export function formatPercentage(
  value: number | string | null | undefined,
  decimals: number = 1,
  /** If true, treat value as fraction (0.11 = 11%). Default false = value is already percentage. */
  isFraction: boolean = false
): string {
  const numericValue = Number(value ?? 0)

  if (isNaN(numericValue)) return '0%'

  // Fix #52: Explicit flag instead of ambiguous auto-detection
  const percentage = isFraction ? numericValue * 100 : numericValue

  return `${formatNumber(percentage, decimals)}%`
}

/**
 * Format a file size in bytes to human-readable string.
 * Example: 1048576 → "1 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`
}

/**
 * Truncate a string to a maximum length with ellipsis.
 */
export function truncate(str: string | null | undefined, maxLength: number = 50): string {
  if (!str) return ''
  if (str.length <= maxLength) return str
  return `${str.slice(0, maxLength)}...`
}

/**
 * Format a phone number to Indonesian format.
 * Example: "08123456789" → "0812-3456-789"
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '-'

  const cleaned = phone.replace(/\D/g, '')

  if (cleaned.length <= 4) return cleaned
  if (cleaned.length <= 8) return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8)}`
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?"
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2)
}

export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    draft: "default", pending: "warning", approved: "success",
    rejected: "danger", cancelled: "danger", completed: "success",
    done: "success", active: "success", sent: "primary",
    posted: "secondary", partial: "warning", paid: "success",
    accepted: "success", converted: "secondary", ordered: "primary",
    received: "success", processed: "success", returned: "warning",
    confirmed: "success", DRAFT: "default", POSTED: "success",
  }
  return colorMap[status] || "default"
}

/**
 * Format a period string (YYYY-MM) to Indonesian month and year.
 * Example: "2026-05" -> "Mei 2026"
 */
export function formatPeriod(period: string | null | undefined): string {
  if (!period || !period.includes("-")) return period ?? "-"
  
  const [year, month] = period.split("-")
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ]
  const mIndex = parseInt(month, 10) - 1
  if (mIndex >= 0 && mIndex < 12) {
    return `${months[mIndex]} ${year}`
  }
  
  return period
}
