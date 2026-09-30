"use client";

import PokerTable from "./PokerTable";
import { BLIND_LEVELS, HANDS_PER_LEVEL } from "./blinds";

type TablePlayer = {
  playerId: string;
  name: string;
  nickname: string | null;
  handsWon: number;
  handsPlayed: number;
  handsFolded: number;
  allIns: number;
  isEliminated: boolean;
  seatOrder: number | null;
};

/**
 * Pre-game phase 1: shows the table with everyone seated + the blind structure
 * for the night (the "rhythm": how often blinds go up and to what). This is
 * info players can't see at a glance on the physical table.
 */
export default function PreGameMesa({ players }: { players: TablePlayer[] }) {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-black text-white">
      {/* Title */}
      <div className="pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2 text-center">
        <p className="text-sm font-black uppercase tracking-[0.3em] text-gray-500">
          La mesa de esta noche
        </p>
      </div>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col px-8 pt-16 pb-2">
        <PokerTable players={players} />
      </div>

      {/* Blind structure ribbon */}
      <BlindStructure />
    </div>
  );
}

function BlindStructure() {
  // Show a compact window of the first levels (enough to communicate the rhythm).
  const shown = BLIND_LEVELS.slice(0, 6);

  return (
    <div className="shrink-0 border-t border-gray-800 bg-gray-950/80 px-6 py-4">
      <div className="mb-3 flex items-center justify-center gap-2">
        <span className="text-2xl">⏫</span>
        <p className="text-lg font-black text-amber-400">
          Las ciegas suben cada {HANDS_PER_LEVEL} rondas
        </p>
      </div>

      <div className="flex items-stretch justify-center gap-2 overflow-x-auto">
        {shown.map((lvl, i) => (
          <div
            key={i}
            className={`flex min-w-[92px] flex-col items-center rounded-lg border px-3 py-2 ${
              i === 0
                ? "border-emerald-500/50 bg-emerald-500/10"
                : "border-gray-800 bg-black/40"
            }`}
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              Nvl {i + 1}
              {i === 0 && <span className="ml-1 text-emerald-400">•</span>}
            </span>
            <span className="mt-1 font-mono text-xl font-black tabular-nums text-white">
              {lvl.sb}
              <span className="px-0.5 text-gray-600">/</span>
              {lvl.bb}
            </span>
            <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-600">
              ronda {i * HANDS_PER_LEVEL}
            </span>
          </div>
        ))}
        <div className="flex min-w-[60px] flex-col items-center justify-center">
          <span className="text-2xl text-gray-700">→</span>
        </div>
      </div>
    </div>
  );
}
