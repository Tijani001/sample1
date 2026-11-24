"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, History, Users, X } from "lucide-react";
import { clearRecent, readRecent, searchHref, type RecentSearch } from "@/components/search/recent";

export function RecentSearches({ today }: { today: string }) {
  const [items, setItems] = useState<RecentSearch[] | null>(null);
  useEffect(() => {
    const load = () => setItems(readRecent());
    load();
    window.addEventListener("gr-recent", load);
    return () => window.removeEventListener("gr-recent", load);
  }, []);
  if (!items?.length) return null;
  return (
    <section aria-labelledby="recent-heading" className="container-page mt-10">
      <div className="flex items-center justify-between">
        <h2 id="recent-heading" className="flex items-center gap-2 text-[17px] font-semibold"><History className="h-[18px] w-[18px] text-ink-3" />Continue your search</h2>
        <button onClick={clearRecent} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-ink-3 hover:bg-surface-2 hover:text-ink"><X className="h-3.5 w-3.5" />Clear</button>
      </div>
      <ul className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {items.map((r) => {
          const date = r.date < today ? today : r.date;
          return (
            <li key={`${r.from}-${r.to}-${r.date}-${r.at}`} className="shrink-0">
              <Link href={searchHref({ from: r.from, to: r.to, date, pax: r.pax, returnDate: r.returnDate && r.returnDate >= date ? r.returnDate : undefined, fromTerminal: r.fromTerminal, toTerminal: r.toTerminal })}
                className="group flex w-[248px] items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 transition hover:border-line-strong hover:shadow-md">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">{r.fromName}<ArrowRight className="h-3.5 w-3.5 text-ink-3" />{r.toName}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-3 tabular">
                    {new Date(`${r.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
                    {r.returnDate && ` – ${new Date(`${r.returnDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`}
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{r.pax}</span>
                    {r.date < today && <span className="text-coral-700">· date passed</span>}
                  </p>
                </div>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-ink transition group-hover:bg-coral-600 group-hover:text-white"><ArrowRight className="h-4 w-4" /></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
