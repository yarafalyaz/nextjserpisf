'use client'

import { Drawer, Button } from '@heroui/react'
import { Filter } from 'lucide-react'
import { useState } from 'react'

interface FilterDrawerProps {
  children: React.ReactNode
  title?: string
}

export function FilterDrawer({ children, title = "Filter" }: FilterDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="lg:hidden"
        onPress={() => setIsOpen(true)}
      >
        <Filter className="size-4" />
        {title}
      </Button>

      <Drawer.Backdrop isOpen={isOpen} onOpenChange={setIsOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>{title}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              {children}
            </Drawer.Body>
            <Drawer.Footer>
              <Button slot="close" variant="secondary">
                Tutup
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  )
}
