"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { ActivityLogTable } from "./activity-log-table"

interface LogRow {
  id: number
  userId: number | null
  userName: string
  action: string
  modelType: string
  modelId: number | null
  description: string
  createdAt: string
  ipAddress: string
  oldValues?: unknown
  newValues?: unknown
}

interface ControllerProps {
  data: LogRow[]
  total: number
  page: number
  pageSize: number
  users: { id: number; name: string }[]
  modelTypes: string[]
  actions: string[]
  filterUser: string
  filterAction: string
  filterModel: string
  filterDateFrom: string
  filterDateTo: string
}

export function ActivityLogController(props: ControllerProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function onFilterChange(key: string, value: string) {
    const sp = new URLSearchParams(searchParams.toString())
    if (!value || value === "all") sp.delete(key)
    else sp.set(key, value)
    // Reset page on any filter change
    sp.delete("halaman")
    router.push(`?${sp.toString()}`)
  }

  return (
    <ActivityLogTable
      data={props.data}
      total={props.total}
      page={props.page}
      pageSize={props.pageSize}
      users={props.users}
      modelTypes={props.modelTypes}
      actions={props.actions}
      filterUser={props.filterUser}
      filterAction={props.filterAction}
      filterModel={props.filterModel}
      filterDateFrom={props.filterDateFrom}
      filterDateTo={props.filterDateTo}
      onFilterChange={onFilterChange}
    />
  )
}
