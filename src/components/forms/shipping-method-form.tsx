"use client"

import { createShippingMethod, updateShippingMethod } from "@/actions/method.actions"
import { MethodForm, type MethodFormProps } from "./method-form"

export function ShippingMethodForm(props: MethodFormProps) {
  return (
    <MethodForm
      {...props}
      config={{
        noun: "metode pengiriman",
        listHref: "/master/metode-pengiriman",
        activeId: "sm-is-active",
        namePlaceholder: "Contoh: Kurir",
        createAction: createShippingMethod,
        updateAction: updateShippingMethod,
      }}
    />
  )
}
