'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs'
import { ReactNode } from 'react'

interface TabItem {
  id: string
  label: string
  content: ReactNode
}

export function DetailTabs({ tabs, ariaLabel }: { tabs: TabItem[]; ariaLabel: string }) {
  return (
    <Tabs defaultValue={tabs[0]?.id} className="w-full">
      <div className="w-full overflow-x-auto">
        <TabsList aria-label={ariaLabel} className="w-full justify-start sm:justify-center inline-flex">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="pt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
