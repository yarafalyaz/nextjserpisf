"use client"

import { createPaymentMethod, updatePaymentMethod } from "@/actions/method.actions"
import { MethodForm, type MethodFormProps } from "./method-form"

export function PaymentMethodForm(props: MethodFormProps) {
  return (
    <MethodForm
      {...props}
      config={{
        noun: "metode pembayaran",
        listHref: "/master/metode-pembayaran",
        activeId: "pm-is-active",
        namePlaceholder: "Contoh: Transfer Bank",
        createAction: createPaymentMethod,
        updateAction: updatePaymentMethod,
      }}
    />
  )
}
