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
      <TabsList aria-label={ariaLabel} className="w-full justify-center">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="pt-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
