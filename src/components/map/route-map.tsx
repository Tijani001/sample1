import { cn } from "@/lib/cn";

// Simplified outline of Nigeria (lng, lat), adequate for a schematic route overview.
const NIGERIA: [number, number][] = [
  [2.69, 6.37], [2.73, 7.8], [2.7, 9.0], [3.1, 9.8], [3.6, 10.3], [3.6, 11.7], [4.1, 13.5], [5.0, 13.8], [6.4, 13.6], [7.4, 13.1], [8.1, 13.3],
  [9.0, 12.8], [10.1, 13.25], [11.0, 13.4], [12.3, 13.1], [13.1, 13.6], [13.6, 13.7], [14.2, 12.4], [14.6, 12.1], [14.6, 11.5], [13.9, 11.0],
  [13.4, 10.1], [13.6, 9.5], [12.9, 8.5], [12.2, 8.2], [11.8, 7.0], [11.1, 6.5], [10.5, 6.9], [9.8, 6.8], [9.4, 6.3], [8.8, 5.4], [8.5, 4.7],
  [7.5, 4.4], [6.9, 4.3], [6.1, 4.27], [5.4, 5.1], [5.0, 5.8], [4.4, 6.3], [3.4, 6.4],
];
const W = 320, H = 256;
const proj = (lng: number, lat: number) => [((lng - 2.4) / 12.5) * W, ((13.95 - lat) / 9.9) * H] as const;

export type MapPoint = { name: string; lat: number; lng: number };

/**
 * Lightweight, offline-capable route overview. When NEXT_PUBLIC_MAPBOX_TOKEN is configured, a Mapbox static
 * map is shown instead. `estimate` draws a schedule-based position and is always labelled as an estimate.
 */
export function RouteMap({ origin, destination, stops = [], estimate, className, label }: { origin: MapPoint; destination: MapPoint; stops?: MapPoint[]; estimate?: number | null; className?: string; label?: string }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    const path = [origin, ...stops, destination].map((p) => `${p.lng},${p.lat}`).join(",");
    const url = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-s+194466(${origin.lng},${origin.lat}),pin-s+F96B4F(${destination.lng},${destination.lat}),path-3+194466-0.8(${encodeURIComponent(polyline([origin, ...stops, destination]))})/auto/640x400@2x?access_token=${token}`;
    void path;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={label ?? `Route from ${origin.name} to ${destination.name}`} className={cn("w-full rounded-2xl object-cover", className)} loading="lazy" />;
  }
  const pts = [origin, ...stops, destination].map((p) => proj(p.lng, p.lat));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 46;
  const minX = Math.max(0, Math.min(...xs) - pad), maxX = Math.min(W, Math.max(...xs) + pad);
  const minY = Math.max(0, Math.min(...ys) - pad), maxY = Math.min(H, Math.max(...ys) + pad);
  let vw = maxX - minX, vh = maxY - minY;
  const ratio = 16 / 10;
  if (vw / vh < ratio) { const d = vh * ratio - vw; vw += d; } else { const d = vw / ratio - vh; vh += d; }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const vb = `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`;
  const scale = vw / W;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  let est: readonly [number, number] | null = null;
  if (estimate != null && estimate > 0 && estimate < 1) {
    const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    let target = segs.reduce((a, b) => a + b, 0) * estimate;
    for (let i = 0; i < segs.length; i++) {
      if (target <= segs[i]) { const t = target / segs[i]; est = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; break; }
      target -= segs[i];
    }
  }
  return (
    <figure className={cn("relative overflow-hidden rounded-2xl border border-line bg-[#eef4f9]", className)}>
      <svg viewBox={vb} className="h-full w-full" role="img" aria-label={label ?? `Map: route from ${origin.name} to ${destination.name}`}>
        <defs><pattern id="grid" width={8 * scale} height={8 * scale} patternUnits="userSpaceOnUse"><path d={`M ${8 * scale} 0 L 0 0 0 ${8 * scale}`} fill="none" stroke="#dbe6ef" strokeWidth={0.4 * scale} /></pattern></defs>
        <rect x={cx - vw} y={cy - vh} width={vw * 2} height={vh * 2} fill="url(#grid)" />
        <path d={NIGERIA.map(([lng, lat], i) => `${i ? "L" : "M"}${proj(lng, lat).join(" ")}`).join(" ") + "Z"} fill="#ffffff" stroke="#b3cde0" strokeWidth={1.2 * scale} strokeLinejoin="round" />
        <path d={d} fill="none" stroke="#194466" strokeOpacity="0.15" strokeWidth={7 * scale} strokeLinecap="round" strokeLinejoin="round" />
        <path d={d} fill="none" stroke="#194466" strokeWidth={2.4 * scale} strokeLinecap="round" strokeLinejoin="round" />
        {stops.map((s, i) => { const [x, y] = proj(s.lng, s.lat); return <circle key={i} cx={x} cy={y} r={3 * scale} fill="#fff" stroke="#4d7fa6" strokeWidth={1.5 * scale} />; })}
        {[origin, destination].map((p, i) => {
          const [x, y] = proj(p.lng, p.lat);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={6 * scale} fill={i ? "#F96B4F" : "#194466"} stroke="#fff" strokeWidth={2 * scale} />
              <text x={x} y={y - 10 * scale} textAnchor="middle" fontSize={10 * scale} fontWeight="600" fill="#102a43" stroke="#fff" strokeWidth={3 * scale} paintOrder="stroke">{p.name}</text>
            </g>
          );
        })}
        {est && (
          <g>
            <circle cx={est[0]} cy={est[1]} r={9 * scale} fill="#F96B4F" fillOpacity="0.18" />
            <circle cx={est[0]} cy={est[1]} r={4.5 * scale} fill="#fff" stroke="#F96B4F" strokeWidth={2 * scale} strokeDasharray={`${2 * scale} ${1.5 * scale}`} />
          </g>
        )}
      </svg>
      {est && <figcaption className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-xs text-ink-2 shadow-sm">○ Estimated position from schedule, not live GPS</figcaption>}
    </figure>
  );
}

// Google polyline encoding for Mapbox static paths.
function polyline(points: MapPoint[]) {
  let out = "", plat = 0, plng = 0;
  const enc = (v: number) => { v = v < 0 ? ~(v << 1) : v << 1; let s = ""; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const p of points) { const la = Math.round(p.lat * 1e5), ln = Math.round(p.lng * 1e5); out += enc(la - plat) + enc(ln - plng); plat = la; plng = ln; }
  return out;
}
