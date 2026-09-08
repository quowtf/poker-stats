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

type Mode = "survival" | "wins"; // survival = bands vanish; wins = dominion (eliminator inherits)

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
  const H = 360;
  const padTop = 16;
  const padBottom = 34;
  const padLeft = 8;
  const padRight = 8;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

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

  const handNumbers = series.map((s) => s.handNumber);

  // Event markers placed ON the player's band line
  const eventMarkers = useMemo(() => {
    return events
      .map((ev) => {
        const i = handNumbers.indexOf(ev.handNumber);
        if (i === -1) return null;
        // In survival mode, if player is already dead, place at their last known band
        return {
          ...ev,
          x: xForHand(i),
          y: yForPlayerAtHand(ev.playerId, ev.handNumber),
        };
      })
      .filter(Boolean) as (ChartEvent & { x: number; y: number })[];
  }, [events, handNumbers, xForHand, yForPlayerAtHand]);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || series.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let minDist = Infinity;
    series.forEach((s, i) => {
      const x = xForHand(i);
      const d = Math.abs(x - relX);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    setHover({ x: xForHand(nearest), handNumber: series[nearest].handNumber });
  }

  const hoverEvents = hover ? events.filter((ev) => ev.handNumber === hover.handNumber) : [];

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
          👑 Dominio
        </button>
      </div>

      <p className="mb-2 text-center text-[10px] text-gray-600">
        {mode === "survival"
          ? "Cada banda desaparece cuando el jugador es eliminado"
          : "Al eliminar a alguien, su territorio pasa al ganador"}
      </p>

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

          {/* Event markers ON player's band */}
          {eventMarkers.map((ev, i) => (
            <g key={i}>
              <circle cx={ev.x} cy={ev.y} r={9} fill="#000" fillOpacity={0.35} />
              <text x={ev.x} y={ev.y} textAnchor="middle" dominantBaseline="central" fontSize={12}>
                {ev.emoji}
              </text>
            </g>
          ))}

          {/* X axis labels */}
          {series.map((s, i) => {
            const step = Math.ceil(series.length / 10);
            if (i % step !== 0 && i !== series.length - 1) return null;
            return (
              <text key={i} x={xForHand(i)} y={H - 16} textAnchor="middle" fontSize={10} fill="#6b7280">
                #{s.handNumber}
              </text>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hover && hoverEvents.length > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded-lg bg-black/90 px-3 py-2 text-xs text-white shadow-lg pointer-events-none z-10">
            <p className="font-bold text-gray-400 mb-1">Mano #{hover.handNumber}</p>
            {hoverEvents.map((ev, i) => (
              <p key={i}>{ev.emoji} {ev.label}</p>
            ))}
          </div>
        )}
      </div>

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
        <span>⚔️ all-in sobrevive</span>
        <span>🐊 all-in gana</span>
        <span>💀 eliminado</span>
        <span>👑 nuevo líder</span>
        <span>🏠🍀🌈 mano fuerte</span>
      </div>
    </div>
  );
}
