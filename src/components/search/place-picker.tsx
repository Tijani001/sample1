"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, Clock, MapPin, Search, TrendingUp, X } from "lucide-react";
import type { Place } from "@/lib/services/search";
import { cn } from "@/lib/cn";
import { readRecent, type RecentSearch } from "./recent";

type Item = { place: Place; group: "recent" | "popular" | "results"; disabled?: boolean };

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function PlacePicker({
  places, value, onSelect, excludeCityId, side, autoFocus = true,
}: {
  places: Place[]; value: Place | null; onSelect: (p: Place) => void; excludeCityId?: string | null; side: "from" | "to"; autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [recent] = useState<RecentSearch[]>(() => (typeof window === "undefined" ? [] : readRecent()));
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 60);
  }, [autoFocus]);

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const mark = (p: Place, group: Item["group"]): Item => ({ place: p, group, disabled: !!excludeCityId && p.cityId === excludeCityId });
    if (!q) {
      const recentPlaces: Item[] = [];
      for (const r of recent) {
        const id = side === "from" ? r.from : r.to;
        const p = places.find((x) => x.id === id && x.kind === "city");
        if (p && !recentPlaces.some((x) => x.place.id === p.id)) recentPlaces.push(mark(p, "recent"));
      }
      const popular = places.filter((p) => p.kind === "city").slice(0, 10).filter((p) => !recentPlaces.some((r) => r.place.id === p.id)).map((p) => mark(p, "popular"));
      return [...recentPlaces.slice(0, 3), ...popular];
    }
    const scored = places
      .map((p) => {
        const name = p.name.toLowerCase();
        const city = p.cityName.toLowerCase();
        let score = -1;
        if (name.startsWith(q)) score = 100;
        else if (city.startsWith(q)) score = 80;
        else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 60;
        else if (name.includes(q) || p.region.toLowerCase().startsWith(q) || (p.address ?? "").toLowerCase().includes(q)) score = 30;
        if (score < 0) return null;
        return { p, score: score + (p.kind === "city" ? 10 : 0) + p.popularity / 20 };
      })
      .filter(Boolean) as { p: Place; score: number }[];
    return scored.sort((a, b) => b.score - a.score).slice(0, 12).map((s) => mark(s.p, "results"));
  }, [query, places, recent, side, excludeCityId]);

  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setActive(items.findIndex((i) => !i.disabled));
  }
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const move = (dir: 1 | -1) => {
    if (!items.length) return;
    let i = active;
    for (let n = 0; n < items.length; n++) {
      i = (i + dir + items.length) % items.length;
      if (!items[i].disabled) break;
    }
    setActive(i);
  };

  const groups: { key: Item["group"]; label: string; icon: React.ReactNode }[] = [
    { key: "recent", label: "Recent", icon: <Clock className="h-3.5 w-3.5" /> },
    { key: "popular", label: "Popular cities", icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { key: "results", label: "Cities and terminals", icon: null },
  ];

  return (
    <div className="flex flex-col">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
            else if (e.key === "Enter") {
              e.preventDefault();
              const it = items[active];
              if (it && !it.disabled) onSelect(it.place);
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          aria-label={side === "from" ? "Search departure city or terminal" : "Search destination city or terminal"}
          placeholder={side === "from" ? "Leaving from: city or terminal" : "Going to: city or terminal"}
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-line-strong bg-surface-2/60 pl-10 pr-10 text-[16px] outline-none transition focus:border-navy-500 focus:bg-white focus:shadow-[0_0_0_3px_rgb(42_93_132/0.12)]"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-3" aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <ul ref={listRef} id={listId} role="listbox" aria-label="Suggestions" className="mt-2 max-h-[min(420px,60dvh)] overflow-y-auto overscroll-contain py-1">
        {items.length === 0 && (
          <li className="px-3 py-10 text-center text-[15px] text-ink-3">
            <p className="font-medium text-ink">No matches for “{query}”</p>
            <p className="mt-1">Try a city name like Lagos, Abuja or Enugu.</p>
          </li>
        )}
        {groups.map((g) => {
          const groupItems = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.group === g.key);
          if (!groupItems.length) return null;
          return (
            <li key={g.key} role="presentation">
              <p className="flex items-center gap-1.5 px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-ink-3">{g.icon}{g.label}</p>
              <ul role="presentation">
                {groupItems.map(({ it, idx }) => {
                  const selected = value?.id === it.place.id;
                  return (
                    <li
                      key={`${g.key}-${it.place.id}`}
                      id={`${listId}-${idx}`}
                      data-index={idx}
                      role="option"
                      aria-selected={idx === active}
                      aria-disabled={it.disabled || undefined}
                      onMouseEnter={() => !it.disabled && setActive(idx)}
                      onClick={() => !it.disabled && onSelect(it.place)}
                      className={cn(
                        "flex min-h-[52px] items-center gap-3 rounded-xl px-3 py-2 transition-colors",
                        it.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
                        idx === active && !it.disabled && "bg-surface-2",
                      )}
                    >
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", it.place.kind === "city" ? "bg-navy-50 text-navy-600" : "bg-coral-50 text-coral-700")}>
                        {it.place.kind === "city" ? <MapPin className="h-[18px] w-[18px]" /> : <Building2 className="h-[18px] w-[18px]" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-ink">{highlight(it.place.name, query.trim())}</span>
                        <span className="block truncate text-[13px] text-ink-3">
                          {it.disabled ? `Already selected as ${side === "from" ? "destination" : "departure"}` : it.place.kind === "city" ? `${it.place.region} · All terminals` : it.place.address}
                        </span>
                      </span>
                      {selected && <span className="text-xs font-medium text-coral-700">Selected</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
