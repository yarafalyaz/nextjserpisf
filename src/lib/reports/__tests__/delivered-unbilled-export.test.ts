import { describe, it, expect } from "vitest"

import { buildDeliveredUnbilledTable } from "../delivered-unbilled-export"
import {
  buildDeliveredUnbilledQueue,
  DELIVERED_UNBILLED_EMPTY_TEXT,
} from "../delivered-unbilled"
import { deliveredUnbilledInput as input } from "./delivered-unbilled-fixtures"
import { FULFILLABLE_ORDER_STATUSES } from "../order-fulfillment-data"

const NOW = new Date(Date.UTC(2026, 9, 26, 3, 0))

describe("buildDeliveredUnbilledTable F-2026-10-26-058-S", () => {
  it("sel verbatim payload + total grand dari queue apa adanya", () => {
    const queue = buildDeliveredUnbilledQueue(
      [input({})],
      NOW,
      FULFILLABLE_ORDER_STATUSES,
    )
    const { columns, rows } = buildDeliveredUnbilledTable(queue)
    expect(columns.map((c) => c.header)).toContain("Belum Terfaktur")
    const data = rows.filter((r) => r.kind === "data")
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      cells: expect.arrayContaining(["SO-0001", "PT Sinar Abadi", "2"]),
    })
    const total = rows.find((r) => r.kind === "total")
    expect(total).toMatchObject({ grand: true })
    expect(total && "label" in total ? total.label : "").toContain(
      "1 pesanan penjualan",
    )
  })

  it("kosong: notice verbatim builder, tanpa baris data/total karang", () => {
    const queue = buildDeliveredUnbilledQueue([], NOW, FULFILLABLE_ORDER_STATUSES)
    const { rows } = buildDeliveredUnbilledTable(queue)
    expect(rows).toEqual([{ kind: "notice", text: DELIVERED_UNBILLED_EMPTY_TEXT }])
  })
})
