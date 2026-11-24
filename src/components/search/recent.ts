"use client";

export type RecentSearch = {
  from: string; fromName: string; to: string; toName: string;
  fromTerminal?: string; toTerminal?: string;
  date: string; returnDate?: string; pax: number; tripType: "one_way" | "round_trip"; at: number;
};

const KEY = "gr_recent_searches";

export function readRecent(): RecentSearch[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function pushRecent(s: Omit<RecentSearch, "at">) {
  try {
    const list = readRecent().filter((r) => !(r.from === s.from && r.to === s.to && r.date === s.date));
    list.unshift({ ...s, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 6)));
    window.dispatchEvent(new Event("gr-recent"));
  } catch {
    /* storage unavailable: recent searches are a convenience only */
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("gr-recent"));
  } catch {}
}

export { searchHref } from "@/lib/search-href";
