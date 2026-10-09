"use client"

import { useState } from "react"
import Image from "next/image"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/shadcn/dialog"
import { cn } from "@/lib/utils"

interface ItemImageLightboxProps {
  src: string
  alt: string
  className?: string
}

/**
 * Thumbnail that opens a full-size lightbox on click. Kept as a tiny client
 * island so the item detail page can stay a server component; the enlarged view
 * reuses the same `unoptimized` source as the edit form.
 */
export function ItemImageLightbox({ src, alt, className }: ItemImageLightboxProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={`Perbesar gambar ${alt}`}
      >
        <Image
          src={src}
          alt={alt}
          width={320}
          height={320}
          className={cn(
            "h-64 w-64 rounded-xl border border-default object-contain bg-surface transition group-hover:opacity-90",
            className,
          )}
          unoptimized
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-black/45 py-1 text-center text-xs text-white opacity-0 transition group-hover:opacity-100">
          Klik untuk perbesar
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">Gambar {alt}</DialogTitle>
          <Image
            src={src}
            alt={alt}
            width={1280}
            height={1280}
            className="max-h-[85vh] w-full object-contain"
            unoptimized
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
