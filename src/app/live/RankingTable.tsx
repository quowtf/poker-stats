"use client";

type RankingEntry = {
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
 * Phase 3 ranking table. Shows the accumulated stats players can't see at a
 * glance on the physical table: wins, folds, all-ins. Alive players are ranked
 * by wins; eliminated players collapse into a compact strikethrough row so
 * everyone still fits on screen alongside the news ticker.
 */
export default function RankingTable({ players }: { players: RankingEntry[] }) {
  const displayName = (p: RankingEntry) => p.nickname || p.name;

  const alive = players
    .filter((p) => !p.isEliminated)
    .sort((a, b) => b.handsWon - a.handsWon || b.handsPlayed - a.handsPlayed);
  const eliminated = players.filter((p) => p.isEliminated);

  return (
    <div className="flex h-full flex-col">
      {/* Column header */}
      <div className="mb-2 grid grid-cols-[3rem_1fr_4rem_4rem_4rem] items-center gap-2 px-4 text-xs font-black uppercase tracking-widest text-gray-600">
        <span>#</span>
        <span>Jugador</span>
        <span className="text-center text-gray-500">Fold</span>
        <span className="text-center text-emerald-600">Win</span>
        <span className="text-center text-orange-600">A-I</span>
      </div>

      {/* Alive players — flexible rows */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {alive.map((p, i) => (
          <div
            key={p.playerId}
            className="grid flex-1 grid-cols-[3rem_1fr_4rem_4rem_4rem] items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/70 px-4"
          >
            {/* Rank medal */}
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-black ${
                i === 0
                  ? "bg-yellow-400 text-black"
                  : i === 1
                  ? "bg-gray-300 text-black"
                  : i === 2
                  ? "bg-amber-700 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
            >
              {i + 1}
            </span>

            {/* Name */}
            <span className="truncate text-2xl font-black">{displayName(p)}</span>

            {/* Stats */}
            <span className="text-center text-2xl font-black tabular-nums text-gray-400">
              {p.handsFolded}
            </span>
            <span className="text-center text-2xl font-black tabular-nums text-emerald-400">
              {p.handsWon}
            </span>
            <span
              className={`text-center text-2xl font-black tabular-nums ${
                p.allIns > 0 ? "text-orange-400" : "text-gray-700"
              }`}
            >
              {p.allIns}
            </span>
          </div>
        ))}
      </div>

      {/* Eliminated — compact strip */}
      {/* {eliminated.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-800/70 px-4 pt-2">
          <span className="text-xs font-black uppercase tracking-widest text-gray-700">
            Fuera
          </span>
          {eliminated.map((p) => (
            <span key={p.playerId} className="text-base font-bold text-gray-600 line-through">
              {displayName(p)}
            </span>
          ))}
        </div>
      )} */}
    </div>
  );
}
