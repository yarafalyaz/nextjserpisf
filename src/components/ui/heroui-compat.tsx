"use client"

/**
 * HeroUI v3 compatibility wrappers.
 * These accept v2-style props (label, isRequired, placeholder on SelectValue)
 * and render them using v3 API patterns.
 */

import React, { type ComponentProps, type ReactNode } from "react"
import {
  Input as HeroInput,
  TextArea as HeroTextArea,
  Select,
  Label,
  Button as HeroButton,
} from "@heroui/react"

// ─── Input ───────────────────────────────────────────────────────────────────

type HeroInputProps = ComponentProps<typeof HeroInput>

interface CompatInputProps extends Omit<HeroInputProps, "label"> {
  label?: string
  isRequired?: boolean
}

export function Input({ label, isRequired, className, ...props }: CompatInputProps) {
  if (label) {
    return (
      <div className={className as string}>
        <Label className="text-sm font-medium text-foreground mb-1.5 block">{label}</Label>
        <HeroInput {...props} required={isRequired || props.required} className="w-full" />
      </div>
    )
  }
  return <HeroInput {...props} required={isRequired || props.required} className={className as string} />
}

// ─── TextArea ────────────────────────────────────────────────────────────────

type HeroTextAreaProps = ComponentProps<typeof HeroTextArea>

interface CompatTextAreaProps extends Omit<HeroTextAreaProps, "label"> {
  label?: string
  isRequired?: boolean
}

export function TextArea({ label, isRequired, className, ...props }: CompatTextAreaProps) {
  if (label) {
    return (
      <div className={className as string}>
        <Label className="text-sm font-medium text-foreground mb-1.5 block">{label}</Label>
        <HeroTextArea {...props} required={isRequired || props.required} className="w-full" />
      </div>
    )
  }
  return <HeroTextArea {...props} required={isRequired || props.required} className={className as string} />
}

// ─── SelectValue (accepts placeholder) ───────────────────────────────────────

interface CompatSelectValueProps {
  placeholder?: string
  children?: ReactNode
}

export function SelectValue({ placeholder, children }: CompatSelectValueProps) {
  return (
    <Select.Value>
      {({ selectedText }: { selectedText?: string }) =>
        children || selectedText || placeholder || "Pilih..."
      }
    </Select.Value>
  )
}

// ─── SelectLabel ─────────────────────────────────────────────────────────────

export function SelectLabel({ children }: { children: ReactNode }) {
  return <Label className="text-sm font-medium text-foreground mb-1.5 block">{children}</Label>
}

// ─── Button (native button → HeroUI Button) ─────────────────────────────────

type HeroButtonProps = ComponentProps<typeof HeroButton>

export function Button({ children, className, ...props }: HeroButtonProps) {
  return (
    <HeroButton {...props} className={className as string}>
      {children}
    </HeroButton>
  )
}
