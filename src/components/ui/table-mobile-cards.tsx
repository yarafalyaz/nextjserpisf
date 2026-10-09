import type { Row } from "@tanstack/react-table"
import { flexRender } from "@tanstack/react-table"
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

function headerLabel(column: { columnDef: { header?: unknown } }): string {
  const header = column.columnDef.header
  return typeof header === "string" && header.trim() ? header : ""
}

/** Is this the actions/buttons column (kept as the card footer)? */
export function isActionsColumnId(id: string): boolean {
  return /aksi|action|opsi|menu/i.test(id)
}

interface TableMobileCardsProps<TData extends { id: number | string }> {
  rows: Row<typeof erpTableFeatures, TData>[]
  /** Rendered in the card footer (row selection checkbox). */
  selectable?: boolean
  ariaLabel?: string
}

/**
 * Mobile (<768px) presentation for <DataTable>: one card per row instead of a
 * horizontally scrolling grid. The card's main line is the designated primary
 * column (or the first visible one); every other visible column becomes a
 * `label: value` line, and the actions column moves to the footer.
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
        className="rounded-md border px-4 py-12 text-center text-sm text-muted-foreground"
      >
        Tidak ada data
      </div>
    )
  }

  return (
    <ul role="list" aria-label={ariaLabel} className="flex flex-col gap-2">
      {rows.map((row) => {
        const cells = row.getVisibleCells()
        const meta = (cell: (typeof cells)[number]) => columnMeta(cell.column.columnDef)

        const primary =
          cells.find((c) => meta(c).mobilePrimary === true) ?? cells[0]
        const details = cells.filter(
          (c) => c.id !== primary?.id && !isActionsColumnId(c.column.id),
        )
        const actions = cells.filter((c) => isActionsColumnId(c.column.id))

        return (
          <li key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
            <div className="rounded-md border bg-surface p-3">
              {primary && (
                <div className="text-sm text-foreground">
                  {meta(primary).mobileValue ? (
                    ((primary.getValue() as React.ReactNode) ?? "-")
                  ) : (
                    flexRender(primary.column.columnDef.cell, primary.getContext())
                  )}
                </div>
              )}

              {details.length > 0 && (
                <dl className="mt-2 flex flex-col gap-1">
                  {details.map((cell) => (
                    <div key={cell.id} className="flex items-baseline gap-2 text-sm">
                      <dt className="shrink-0 text-xs text-muted-foreground">
                        {headerLabel(cell.column) || cell.column.id}
                      </dt>
                      <dd className="min-w-0 break-words text-foreground">
                        {meta(cell).mobileValue ? (
                          ((cell.getValue() as React.ReactNode) ?? "-")
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {(actions.length > 0 || selectable) && (
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-default pt-2">
                  <div className="flex items-center gap-2">{/* selection slot */}</div>
                  <div className="flex items-center gap-2">
                    {actions.map((cell) => (
                      <div key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
