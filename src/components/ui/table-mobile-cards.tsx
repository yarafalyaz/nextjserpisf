import type { Row } from "@tanstack/react-table"
import { flexRender } from "@tanstack/react-table"
import { Card } from "@/components/ui/shadcn/card"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { erpTableFeatures, type ErpColumnDef } from "@/lib/table"

/**
 * Per-column metadata consumed by the mobile card layout (see `DataTable`).
 * Extend `meta` on any column to control how it renders on small screens.
 */
export interface ErpColumnMeta {
  /** Force-show (`true`) or force-hide (`false`) a column on mobile before the budget is applied. */
  mobile?: boolean
  /**
   * Render this column as the card's header line (name + sub-line) instead of a
   * labelled row. Defaults to the first visible column when none opts in. The
   * cell markup is rendered unchanged, so links and thumbnails keep working.
   */
  mobilePrimary?: boolean
  /**
   * Card lines use the cell's raw value (`getValue()`) instead of its renderer.
   * Set on columns whose desktop cell is an interactive widget (buttons, menus)
   * so the compact card can still show the underlying text.
   */
  mobileValue?: boolean
}

export function columnMeta<TData extends { id: number | string }>(
  column: ErpColumnDef<TData, any>,
): ErpColumnMeta {
  return (column.meta ?? {}) as ErpColumnMeta
}

export function headerLabel(column: { columnDef: { header?: unknown } }): string {
  const header = column.columnDef.header
  return typeof header === "string" && header.trim() ? header : ""
}

/** Is this the actions/buttons column (kept as the card footer)? */
export function isActionsColumnId(id: string): boolean {
  return /aksi|action|opsi|menu/i.test(id)
}

interface TableMobileCardsProps<TData extends { id: number | string }> {
  rows: Row<typeof erpTableFeatures, TData>[]
  /** Render a selection checkbox in each card header (toggles the row's selection). */
  selectable?: boolean
  ariaLabel?: string
}

/**
 * Mobile (<768px) presentation for <DataTable>: one card per row instead of a
 * horizontally scrolling grid. The card's header is the designated primary
 * column (or the first visible one); every other visible column becomes a
 * `label → value` line, and the actions column moves to the footer. The result
 * fits the viewport, so there is nothing to pan left/right.
 */
export function TableMobileCards<TData extends { id: number | string }>({
  rows,
  selectable = false,
  ariaLabel = "Daftar data",
}: TableMobileCardsProps<TData>) {
  if (rows.length === 0) {
    return (
      <div
        role="region"
        aria-label={ariaLabel}
        className="rounded-lg border border-default bg-surface px-4 py-12 text-center text-sm text-muted-foreground"
      >
        Tidak ada data
      </div>
    )
  }

  return (
    <ul role="list" aria-label={ariaLabel} className="flex flex-col gap-3">
      {rows.map((row) => {
        const cells = row.getVisibleCells()
        const meta = (cell: (typeof cells)[number]) => columnMeta(cell.column.columnDef)
        const isActions = (cell: (typeof cells)[number]) =>
          isActionsColumnId(cell.column.id)
        const renderValue = (cell: (typeof cells)[number]) =>
          meta(cell).mobileValue
            ? ((cell.getValue() as React.ReactNode) ?? "-")
            : flexRender(cell.column.columnDef.cell, cell.getContext())

        const primary =
          cells.find((c) => meta(c).mobilePrimary === true) ??
          cells.find((c) => !isActions(c)) ??
          cells[0]
        const details = cells.filter((c) => c.id !== primary?.id && !isActions(c))
        const actions = cells.filter(isActions)
        const selected = row.getIsSelected()

        return (
          <li key={row.id} data-state={selected ? "selected" : undefined}>
            <Card
              className={
                "gap-0 overflow-hidden py-0 " +
                (selected ? "border-primary/50 ring-1 ring-primary/20" : "")
              }
            >
              {/* Header: selection + primary content (name, SKU, thumbnail...) */}
              <div className="flex items-start gap-3 p-3">
                {selectable && (
                  <Checkbox
                    aria-label={`Pilih baris ${row.original.id}`}
                    className="mt-1 shrink-0"
                    checked={selected}
                    onCheckedChange={(v) => row.toggleSelected(!!v)}
                  />
                )}
                <div className="min-w-0 flex-1 text-sm text-foreground">
                  {primary ? renderValue(primary) : null}
                </div>
              </div>

              {/* Details: one label → value line per remaining visible column */}
              {details.length > 0 && (
                <dl className="divide-y divide-default border-t border-default text-sm">
                  {details.map((cell) => (
                    <div
                      key={cell.id}
                      className="flex items-start justify-between gap-3 px-3 py-2"
                    >
                      <dt className="shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">
                        {headerLabel(cell.column) || cell.column.id}
                      </dt>
                      <dd className="min-w-0 break-words text-right text-foreground">
                        {renderValue(cell)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* Footer: actions only — the column moves here so it stays reachable */}
              {actions.length > 0 && (
                <div className="flex items-center justify-end gap-1 border-t border-default bg-muted/40 px-2 py-1.5">
                  {actions.map((cell) => (
                    <div key={cell.id}>{renderValue(cell)}</div>
                  ))}
                </div>
              )}
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
