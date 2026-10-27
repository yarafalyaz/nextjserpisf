import type {
  CustomerCreditQueueCreditInput,
  CustomerCreditQueueDownPaymentInput,
} from "../customer-credit-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Fixture bersama builder + kartu antrean saldo kredit 083. Hari acuan = hari WIB dari `now`. */
export function creditQueueDay(now: Date) {
  const today = getWibTodayUtcDate(now)
  return (offset: number) => new Date(today.getTime() + offset * 86_400_000)
}

export function creditQueueCredit(
  now: Date,
  partial: Partial<CustomerCreditQueueCreditInput> & { creditId: number },
): CustomerCreditQueueCreditInput {
  const day = creditQueueDay(now)
  return {
    documentNo: `CC-${partial.creditId}`,
    customerId: 7,
    customerName: "CV Uji",
    sourceType: "DownPayment",
    sourceId: 100,
    receivedAmount: 10_000_000,
    allocatedAmount: 0,
    refundedAmount: 0,
    status: "open",
    createdAt: day(-10),
    ...partial,
  }
}

export function creditQueueDp(
  partial: Partial<CustomerCreditQueueDownPaymentInput> & {
    downPaymentId: number
  },
): CustomerCreditQueueDownPaymentInput {
  return { ppnUangMuka: 1_000_000, ...partial }
}
