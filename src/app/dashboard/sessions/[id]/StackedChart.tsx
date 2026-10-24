"use client";

import { useState, useMemo, useRef } from "react";
import type { ChartEvent, ChartPlayer, DominionPoint } from "@/lib/chart-types";

// Marker radius on the SVG canvas. Markers sit ON the player's band, so they
// need to fit inside the horizontal padding without being clipped.
const MARKER_R = 9;
const MARKER_GAP = 16; // vertical fan-out when several markers share a spot

export default function StackedChart({
  players,
  dominionSeries,
  events,
}: {
  players: ChartPlayer[];
  dominionSeries: DominionPoint[];
  events: ChartEvent[];
}) {
  const [hover, setHover] = useState<{ x: number; handNumber: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const series = dominionSeries;

  // Dimensions — horizontal padding must clear the marker radius so the first
  // and last columns are never cut off at the viewBox edge.
  const W = 800;
  const H = 360;
  const padTop = 18;
  const padBottom = 34;
  const padLeft = 16;
  const padRight = 16;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

  // Order: winner on top (index 0 = top of stack)
  const orderedPlayers = useMemo(
    () => [...players].sort((a, b) => (a.finishPosition || 99) - (b.finishPosition || 99)),
    [players]
  );

  const { areas, xForHand, yForPlayerAtHand } = useMemo(() => {
    const n = series.length;
    if (n === 0) return { areas: [], xForHand: () => 0, yForPlayerAtHand: () => padTop };

    let maxTotal = 0;
    for (const s of series) {
      const total = orderedPlayers.reduce((sum, p) => sum + (s.values[p.id] || 0), 0);
      if (total > maxTotal) maxTotal = total;
    }
    if (maxTotal === 0) maxTotal = 1;

    const xForHand = (i: number) => padLeft + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);

    const areas = orderedPlayers.map((player, pIdx) => {
      const topPoints: [number, number][] = [];
      const bottomPoints: [number, number][] = [];

      series.forEach((s, i) => {
        const x = xForHand(i);
        let below = 0;
        for (let k = pIdx + 1; k < orderedPlayers.length; k++) {
          below += s.values[orderedPlayers[k].id] || 0;
        }
        const val = s.values[player.id] || 0;
        const yBottom = padTop + chartH - (below / maxTotal) * chartH;
        const yTop = padTop + chartH - ((below + val) / maxTotal) * chartH;
        topPoints.push([x, yTop]);
        bottomPoints.push([x, yBottom]);
      });

      const topPath = topPoints.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
      const bottomPath = bottomPoints.slice().reverse().map(([x, y]) => `L${x},${y}`).join(" ");
      const path = `${topPath} ${bottomPath} Z`;

      return { player, path };
    });

    // Y coordinate at the MIDDLE of a player's band for a given hand number
    const yForPlayerAtHand = (playerId: string, handNumber: number): number => {
      const i = series.findIndex((s) => s.handNumber === handNumber);
      if (i === -1) return padTop;
      const s = series[i];
      const pIdx = orderedPlayers.findIndex((p) => p.id === playerId);
      if (pIdx === -1) return padTop;
      let below = 0;
      for (let k = pIdx + 1; k < orderedPlayers.length; k++) {
        below += s.values[orderedPlayers[k].id] || 0;
      }
      const val = s.values[playerId] || 0;
      const yMid = padTop + chartH - ((below + val / 2) / maxTotal) * chartH;
      return yMid;
    };

    return { areas, xForHand, yForPlayerAtHand };
  }, [series, orderedPlayers, chartW, chartH]);

  const handNumbers = useMemo(() => series.map((s) => s.handNumber), [series]);

  // Event markers placed ON the player's band line.
  type PlacedMarker = ChartEvent & { x: number; y: number };
  const eventMarkers = useMemo<PlacedMarker[]>(() => {
    const raw: PlacedMarker[] = [];

    events.forEach((ev) => {
      const i = handNumbers.indexOf(ev.handNumber);
      if (i === -1) return;

      let x = xForHand(i);
      let anchorHand = ev.handNumber;

      // An elimination happens AFTER the territory is transferred away, so the
      // player's band is already empty at that hand. Anchor the skull to the
      // last hand they still held territory — otherwise it floats over someone
      // else's color.
      if (ev.type === "elimination" && i > 0) {
        anchorHand = series[i - 1].handNumber;
        x = xForHand(i - 1);
      }

      const y = yForPlayerAtHand(ev.playerId, anchorHand);
      raw.push({ ...ev, x, y });
    });

    // Fan out markers sharing a position (e.g. a strong hand won while all-in
    // draws 🏠 and 🐊 on the exact same point, hiding one of them).
    const groups = new Map<string, PlacedMarker[]>();
    raw.forEach((m) => {
      const key = `${Math.round(m.x)}:${Math.round(m.y)}`;
      const g = groups.get(key);
      if (g) g.push(m);
      else groups.set(key, [m]);
    });

    const out: PlacedMarker[] = [];
    groups.forEach((g) => {
      if (g.length === 1) {
        out.push(g[0]);
        return;
      }
      const mid = (g.length - 1) / 2;
      g.forEach((m, idx) => {
        out.push({
          ...m,
          y: clamp(m.y + (idx - mid) * MARKER_GAP, padTop + MARKER_R, padTop + chartH - MARKER_R),
        });
      });
    });

    return out;
  }, [events, handNumbers, series, xForHand, yForPlayerAtHand, chartH]);

  function updateHover(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current || series.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let minDist = Infinity;
    series.forEach((s, i) => {
      const d = Math.abs(xForHand(i) - relX);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    setHover({ x: xForHand(nearest), handNumber: series[nearest].handNumber });
  }

  const hoverEvents = hover ? events.filter((ev) => ev.handNumber === hover.handNumber) : [];

  // Territory snapshot for the hovered hand — turns the tooltip into "who is
  // winning right now" instead of a bare event list.
  const hoverSeries = hover ? series.find((s) => s.handNumber === hover.handNumber) : null;
  const territory = useMemo(() => {
    if (!hoverSeries) return [] as { player: ChartPlayer; value: number }[];
    return orderedPlayers
      .map((player) => ({ player, value: hoverSeries.values[player.id] || 0 }))
      .filter((t) => t.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [hoverSeries, orderedPlayers]);
  const territoryTotal = territory.reduce((sum, t) => sum + t.value, 0);

  // Post-game one-liner: the "story" of the table distilled from the events,
  // so the chart reads as a recap and not just a colored blob.
  const storyline = useMemo(() => {
    const winner = players.find((p) => p.finishPosition === 1);
    const eliminations = events.filter((e) => e.type === "elimination").length;
    const changes = events.filter((e) => e.type === "leader_change").length;
    const strong = events.filter((e) => e.type === "strong_hand").length;
    const parts: string[] = [];
    if (winner) parts.push(`🏆 ${winner.name} terminó con la mesa`);
    parts.push(`${series.length} mano${series.length === 1 ? "" : "s"}`);
    if (changes > 0) parts.push(`${changes} cambio${changes === 1 ? "" : "s"} de líder`);
    if (eliminations > 0) parts.push(`${eliminations} eliminación${eliminations === 1 ? "" : "es"}`);
    if (strong > 0) parts.push(`${strong} mano${strong === 1 ? "" : "s"} fuerte${strong === 1 ? "" : "s"}`);
    return parts.join(" · ");
  }, [players, events, series.length]);

  if (series.length === 0) {
    return (
      <div className="rounded-xl bg-gray-900 p-6 text-center text-sm text-gray-600">
        Sin manos registradas para graficar el dominio de la mesa.
      </div>
    );
  }

  const xLabelStep = Math.max(1, Math.ceil(series.length / 10));

  return (
    <div>
      <p className="mb-3 text-center text-[10px] text-gray-600">
        Al eliminar a alguien, su territorio pasa al ganador — el verdugo de la mesa se expande
      </p>

      {/* Chart */}
      <div className="relative rounded-xl bg-gray-900 p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: "auto" }}
          role="img"
          aria-label="Dominio de la mesa: territorio acumulado por jugador a lo largo de la sesión"
          onPointerMove={updateHover}
          onPointerDown={updateHover}
          onPointerLeave={() => setHover(null)}
        >
          {/* Areas */}
          {areas.map(({ player, path }) => (
            <path
              key={player.id}
              d={path}
              fill={player.color}
              fillOpacity={0.85}
              stroke={player.color}
              strokeWidth={0.5}
            />
          ))}

          {/* Hover vertical line */}
          {hover && (
            <line x1={hover.x} y1={padTop} x2={hover.x} y2={padTop + chartH} stroke="#fff" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
          )}

          {/* Event markers ON player's band */}
          {eventMarkers.map((ev, i) => (
            <g key={`${ev.type}-${ev.playerId}-${ev.handNumber}-${i}`}>
              <circle
                cx={ev.x}
                cy={ev.y}
                r={ev.type === "strong_hand" ? MARKER_R + 1 : MARKER_R}
                fill="#000"
                fillOpacity={0.4}
                stroke={ev.type === "strong_hand" ? "#fbbf24" : "none"}
                strokeWidth={ev.type === "strong_hand" ? 1.2 : 0}
              />
              <text x={ev.x} y={ev.y} textAnchor="middle" dominantBaseline="central" fontSize={12} aria-hidden="true">
                {ev.emoji}
              </text>
            </g>
          ))}

          {/* X axis labels */}
          {series.map((s, i) => {
            if (i % xLabelStep !== 0 && i !== series.length - 1) return null;
            return (
              <text key={i} x={xForHand(i)} y={H - 16} textAnchor="middle" fontSize={10} fill="#6b7280">
                #{s.handNumber}
              </text>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hover && (
          <div className="pointer-events-none absolute left-1/2 top-2 z-10 w-56 -translate-x-1/2 rounded-lg bg-black/90 px-3 py-2 text-xs text-white shadow-lg">
            <p className="mb-1 font-bold text-gray-400">Mano #{hover.handNumber}</p>

            {territory.length > 0 && (
              <div className="mb-1 space-y-0.5">
                {territory.map((t, i) => (
                  <div key={t.player.id} className="flex items-center gap-2">
                    <span className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: t.player.color }} />
                    <span className="flex-1 truncate text-gray-300">
                      {t.player.name}
                      {i === 0 && <span className="ml-1 text-yellow-400">👑</span>}
                    </span>
                    <span className="tabular-nums text-gray-400">
                      {territoryTotal > 0 ? Math.round((t.value / territoryTotal) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {hoverEvents.length > 0 && (
              <div className="mt-1 space-y-0.5 border-t border-gray-700 pt-1">
                {hoverEvents.map((ev, i) => (
                  <p key={i}>{ev.emoji} {ev.label}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Storyline */}
      <p className="mt-3 text-center text-[11px] text-gray-500">{storyline}</p>

      {/* Legend players */}
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        {orderedPlayers.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: p.color }} />
            <span className="text-gray-400">{p.name}</span>
          </div>
        ))}
      </div>

      {/* Legend events */}
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-gray-600">
        <span title="All-in: 🐊 gana el bote · ⚔️ sobrevive">🐊⚔️ all-in</span>
        <span title="El jugador queda fuera">💀 eliminado</span>
        <span title="Cambio de líder del territorio">👑 nuevo líder</span>
        <span title="Full house">🏠 Full</span>
        <span title="Póker (four of a kind)">🍀 Póker</span>
        <span title="Escalera de color">🌈 Esc. Color</span>
        <span title="Escalera real">💎 Esc. Real</span>
      </div>
    </div>
  );
}
