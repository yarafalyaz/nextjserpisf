import type { ReactNode } from "react";

/**
 * Kerangka kartu antrean tiket CRM bersama (pola 032-S): section +
 * judul + strip ringkasan label-nilai + notice + slot isi. Tiap kartu
 * domain (antrean/SLA/beban) mengisi ringkasan dan isi sendiri dari
 * hasil loader verbatim — kerangka ini tidak menghitung apa pun.
 */
export function CrmTicketCardShell({
  title,
  summaryItems,
  noticeText,
  children,
}: Readonly<{
  title: string;
  summaryItems: ReadonlyArray<readonly [string, number]>;
  noticeText: string;
  children: ReactNode;
}>) {
  return (
    <section
      aria-label={title}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {title}
        </h2>
      </div>
      <div className="p-4 px-5">
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {summaryItems.map(([label, count]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-semibold text-foreground">{count}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{noticeText}</p>
        {children}
      </div>
    </section>
  );
}
