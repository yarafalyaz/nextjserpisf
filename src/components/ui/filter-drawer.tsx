'use client'

import { Filter } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/shadcn/sheet'
import { Button } from '@/components/ui/shadcn/button'

interface FilterDrawerProps {
  children: React.ReactNode
  title?: string
}

export function FilterDrawer({ children, title = "Filter" }: FilterDrawerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm" className="lg:hidden">
          <Filter className="size-4" />
          {title}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-2">{children}</div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="secondary">Tutup</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
