"use client"

import { Sun, Moon, Monitor, Check } from "lucide-react"
import { useSyncExternalStore } from "react"
import { Button } from "@/components/ui/shadcn/button"
import { useTheme } from "@/components/providers/theme-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu"

const subscribe = () => () => undefined
const getClientSnapshot = () => true
const getServerSnapshot = () => false

const OPTIONS = [
  { value: "light", label: "Terang", icon: Sun },
  { value: "dark", label: "Gelap", icon: Moon },
  { value: "system", label: "Sistem", icon: Monitor },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
  const activeTheme = mounted ? theme : "system"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ganti tema" className="relative">
          <Sun className="size-5 rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0" aria-hidden="true" />
          <Moon className="absolute size-5 rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isActive = activeTheme === opt.value
          return (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => setTheme(opt.value)}
              className="gap-2"
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="flex-1">{opt.label}</span>
              {isActive && <Check className="size-4 text-primary" aria-hidden="true" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
