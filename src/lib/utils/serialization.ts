/**
 * Type that recursively converts Prisma-specific types (Decimal, Date, BigInt)
 * into their plain JSON-serialisable equivalents.
 */
type PlainValue<T> = T extends { toFixed: () => unknown } // Prisma.Decimal
  ? number
  : T extends Date
  ? string
  : T extends bigint
  ? string
  : T extends Array<infer U>
  ? Array<Plain<U>>
  : T extends object
  ? { [K in keyof T]: Plain<T[K]> }
  : T;

export type Plain<T> = PlainValue<T>;

/**
 * Deep-clone a Prisma result into a plain JSON-serialisable object.
 *
 * Prisma returns `Decimal` (Prisma.Decimal) and `Date` instances. Server
 * Components pass data to Client Components across the RSC boundary via
 * the Flight payload encoder, which handles `Date` natively but does
 * NOT serialise `Prisma.Decimal` cleanly — it ends up as a nested
 * `{ d, s, e, ... }` object on the client, breaking things like
 * react-table's `row.getVisibleCells().map(...)` with
 * "w.map is not a function" errors.
 *
 * The old code used `JSON.parse(JSON.stringify(x))` to strip class
 * metadata, but that also strips Prisma Decimal to a nested object.
 * This helper recursively converts Decimal → number, Date → ISO string,
 * and preserves everything else.
 */
export function toPlain<T>(value: T): Plain<T> {
  if (value === null || value === undefined) return value as Plain<T>;
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v === null || v === undefined) return v;
      if (typeof v === "bigint") return v.toString();
      // Prisma.Decimal — duck-type check
      if (
        typeof v === "object" &&
        v !== null &&
        "toFixed" in v &&
        typeof (v as { toFixed: unknown }).toFixed === "function" &&
        "d" in v
      ) {
        return Number((v as { toString(): string }).toString());
      }
      if (v instanceof Date) return v.toISOString();
      return v;
    }),
  ) as Plain<T>;
}
