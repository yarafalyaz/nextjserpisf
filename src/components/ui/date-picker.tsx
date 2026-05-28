"use client"

import { Calendar, DateField, DatePicker as HeroDatePicker, Label } from "@heroui/react"
import { parseDate } from "@internationalized/date"
import type { DateValue } from "@internationalized/date"
import { I18nProvider } from "react-aria-components"

interface AppDatePickerProps {
  label: string
  name: string
  value?: string // ISO date string "YYYY-MM-DD"
  defaultValue?: string
  onChange?: (dateStr: string) => void
  required?: boolean
  className?: string
}

export function AppDatePicker({ label, name, value, defaultValue, onChange, required, className }: AppDatePickerProps) {
  const parsedValue = value ? parseDate(value) : undefined
  const parsedDefault = defaultValue ? parseDate(defaultValue) : undefined

  function handleChange(val: DateValue | null) {
    if (val && onChange) {
      onChange(val.toString())
    }
  }

  return (
    <I18nProvider locale="id-ID">
      <HeroDatePicker
        name={name}
        value={parsedValue}
        defaultValue={parsedDefault}
        onChange={handleChange}
        isRequired={required}
        className={className}
      >
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <DateField.Group fullWidth className="form-input" style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px" }}>
          <DateField.Input style={{ display: "flex", gap: "2px", flex: 1 }}>
            {(segment) => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateField.Suffix>
            <HeroDatePicker.Trigger>
              <HeroDatePicker.TriggerIndicator />
            </HeroDatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <HeroDatePicker.Popover placement="bottom start" className="z-50 min-w-[280px]">
          <Calendar aria-label={label} className="p-3">
            <Calendar.Header>
              <Calendar.NavButton slot="previous" />
              <Calendar.Heading />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid className="w-full">
              <Calendar.GridHeader>
                {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
          </Calendar>
        </HeroDatePicker.Popover>
      </HeroDatePicker>
    </I18nProvider>
  )
}
