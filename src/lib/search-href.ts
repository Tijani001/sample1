export function searchHref(s: { from: string; to: string; date: string; pax: number; returnDate?: string; fromTerminal?: string; toTerminal?: string; vehicle?: string }) {
  const p = new URLSearchParams({ from: s.from, to: s.to, date: s.date, pax: String(s.pax) });
  if (s.returnDate) p.set("return", s.returnDate);
  if (s.fromTerminal) p.set("fromTerminal", s.fromTerminal);
  if (s.toTerminal) p.set("toTerminal", s.toTerminal);
  if (s.vehicle && s.vehicle !== "any") p.set("vehicle", s.vehicle);
  return `/search?${p.toString()}`;
}
