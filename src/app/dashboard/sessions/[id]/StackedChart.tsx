"use client";

import { useState, useMemo, useRef } from "react";

type Player = { id: string; name: string; color: string; finishPosition: number | null };
type Series = { handNumber: number; values: Record<string, number> };
type ChartEvent = {
  handNumber: number;
  playerId: string;
  playerName: string;
  type: "allin_win" | "allin_survive" | "elimination" | "strong_hand" | "leader_change";
  emoji: string;
  label: string;
};

type Mode = "wins" | "survival";

export default function StackedChart({
  players,
  winsSeries,
  survivalSeries,
  events,
}: {
  players: Player[];
  winsSeries: Series[];
  survivalSeries: Series[];
  events: ChartEvent[];
}) {
  const [mode, setMode] = useState<Mode>("survival");
  const [hover, setHover] = useState<{ x: number; handNumber: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const series = mode === "wins" ? winsSeries : survivalSeries;

  // Dimensions
  const W = 800;
  const H = 340;
  const padTop = 20;
  const padBottom = 40;
  const padLeft = 10;
  const padRight = 10;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  // Order players by finish position (winner on top for nice visual, like AoE2)
  const orderedPlayers = useMemo(
    () => [...players].sort((a, b) => (a.finishPosition || 99) - (b.finishPosition || 99)),
    [players]
  );

  // Build stacked areas
  const { areas, maxTotal, xForHand } = useMemo(() => {
    const n = series.length;
    if (n === 0) return { areas: [], maxTotal: 1, xForHand: () => 0 };

    // Max total across all hands (for scaling Y)
    let maxTotal = 0;
    for (const s of series) {
      const total = orderedPlayers.reduce((sum, p) => sum + (s.values[p.id] || 0), 0);
      if (total > maxTotal) maxTotal = total;
    }
    if (maxTotal === 0) maxTotal = 1;

    const xForHand = (i: number) => padLeft + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);

    // For each player, build top and bottom boundary points (stacked)
    const areas = orderedPlayers.map((player, pIdx) => {
      const topPoints: [number, number][] = [];
      const bottomPoints: [number, number][] = [];

      series.forEach((s, i) => {
        const x = xForHand(i);
        // Cumulative sum of players below this one
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

      // Build path: top left→right, then bottom right→left
      const topPath = topPoints.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
      const bottomPath = bottomPoints.reverse().map(([x, y]) => `L${x},${y}`).join(" ");
      const path = `${topPath} ${bottomPath} Z`;

      return { player, path };
    });

    return { areas, maxTotal, xForHand };
  }, [series, orderedPlayers, chartW, chartH]);

  const handNumbers = series.map((s) => s.handNumber);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || series.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    // Find nearest hand
    let nearest = 0;
    let minDist = Infinity;
    series.forEach((s, i) => {
      const x = xForHand(i);
      const d = Math.abs(x - relX);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    setHover({ x: xForHand(nearest), handNumber: series[nearest].handNumber });
  }

  // Events near hovered hand
  const hoverEvents = hover ? events.filter((ev) => ev.handNumber === hover.handNumber) : [];

  // Event markers on top axis
  const eventMarkers = useMemo(() => {
    return events.map((ev) => {
      const i = handNumbers.indexOf(ev.handNumber);
      if (i === -1) return null;
      return { ...ev, x: xForHand(i) };
    }).filter(Boolean) as (ChartEvent & { x: number })[];
  }, [events, handNumbers, xForHand]);

  return (
    <div>
      {/* Mode toggle */}
      <div className="mb-3 flex justify-center gap-2">
        <button
          onClick={() => setMode("survival")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            mode === "survival" ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400"
          }`}
        >
          🩸 Supervivencia
        </button>
        <button
          onClick={() => setMode("wins")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            mode === "wins" ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400"
          }`}
        >
          🏆 Dominio
        </button>
      </div>

      {/* Chart */}
      <div className="relative rounded-xl bg-gray-900 p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: "auto" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
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

          {/* Event markers (top axis) */}
          {eventMarkers.map((ev, i) => (
            <g key={i}>
              <line x1={ev.x} y1={padTop} x2={ev.x} y2={padTop + chartH} stroke="#ffffff" strokeWidth={0.5} opacity={0.08} />
              <text x={ev.x} y={padTop - 6} textAnchor="middle" fontSize={11}>{ev.emoji}</text>
            </g>
          ))}

          {/* X axis labels (every few hands) */}
          {series.map((s, i) => {
            const step = Math.ceil(series.length / 10);
            if (i % step !== 0 && i !== series.length - 1) return null;
            return (
              <text key={i} x={xForHand(i)} y={H - 20} textAnchor="middle" fontSize={10} fill="#6b7280">
                #{s.handNumber}
              </text>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hover && hoverEvents.length > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded-lg bg-black/90 px-3 py-2 text-xs text-white shadow-lg pointer-events-none">
            <p className="font-bold text-gray-400 mb-1">Mano #{hover.handNumber}</p>
            {hoverEvents.map((ev, i) => (
              <p key={i}>{ev.emoji} {ev.label}</p>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        {orderedPlayers.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: p.color }} />
            <span className="text-gray-400">{p.name}</span>
          </div>
        ))}
      </div>

      {/* Event legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-gray-600">
        <span>⚔️ all-in sobrevive</span>
        <span>🐊 all-in gana</span>
        <span>💀 eliminado</span>
        <span>👑 nuevo líder</span>
        <span>🏠🍀🌈 mano fuerte</span>
      </div>
    </div>
  );
}
