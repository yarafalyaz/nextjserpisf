'use client'

import { Tabs } from '@heroui/react'
import { ReactNode } from 'react'

interface TabItem {
  id: string
  label: string
  content: ReactNode
}

export function DetailTabs({ tabs, ariaLabel }: { tabs: TabItem[]; ariaLabel: string }) {
  return (
    <Tabs defaultSelectedKey={tabs[0]?.id}>
      <Tabs.ListContainer>
        <Tabs.List aria-label={ariaLabel}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.id} id={tab.id}>
              {tab.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      {tabs.map((tab) => (
        <Tabs.Panel key={tab.id} id={tab.id}>
          {tab.content}
        </Tabs.Panel>
      ))}
    </Tabs>
  )
}
