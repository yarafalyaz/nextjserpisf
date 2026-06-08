"use client"

import { QRCodeSVG } from "qrcode.react"

interface QrCodeDisplayProps {
  /** The data encoded in the QR (typically a URL to the item detail/scan page). */
  value: string
  /** Human-readable caption shown under the QR (e.g. the item code). */
  caption?: string
  size?: number
  className?: string
}

/** Renders a QR code (SVG) plus an optional caption. */
export function QrCodeDisplay({ value, caption, size = 132, className }: QrCodeDisplayProps) {
  if (!value) {
    return <span className="text-xs text-muted-foreground">QR belum tersedia</span>
  }
  return (
    <div className={className}>
      <div className="inline-block rounded-md bg-white p-3">
        <QRCodeSVG value={value} size={size} level="M" marginSize={0} />
      </div>
      {caption && (
        <div className="mt-1 text-center font-mono text-xs text-muted-foreground">{caption}</div>
      )}
    </div>
  )
}
