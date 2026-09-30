"use client";

import { TABLE_SEATS } from "./tableSeats";

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

type PokerTableProps = {
  players: TablePlayer[];
  /** playerId holding the dealer button (D) in the last recorded hand. */
  dealerId?: string | null;
  /** playerId on the small blind (SB) in the last recorded hand. */
  sbId?: string | null;
};

/**
 * Renders players around the real rectangular poker table using FIXED seats
 * (a0..a9, clockwise from the top-left corner — see tableSeats.ts).
 *
 * A player sits at the seat given by `seatOrder`. Empty seats stay empty
 * (fixed gaps): remaining players never shift. Players without a seatOrder
 * fall back to the first free seats, ordered alphabetically, so the view
 * still works for older sessions that never captured seats.
 *
 * Eliminated players stay in their seat, dimmed.
 */
export default function PokerTable({ players, dealerId, sbId }: PokerTableProps) {
  const displayNameOf = (p: TablePlayer) => p.nickname || p.name;

  // Map players onto fixed seats.
  const bySeat = new Map<number, TablePlayer>();
  const withoutSeat: TablePlayer[] = [];

  for (const p of players) {
    if (p.seatOrder !== null && p.seatOrder >= 0 && p.seatOrder < TABLE_SEATS.length) {
      // If two players collide on a seat, keep the first and spill the rest.
      if (bySeat.has(p.seatOrder)) withoutSeat.push(p);
      else bySeat.set(p.seatOrder, p);
    } else {
      withoutSeat.push(p);
    }
  }

  // Assign seatless players to the first free seats (alphabetical, deterministic).
  withoutSeat
    .sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b)))
    .forEach((p) => {
      const free = TABLE_SEATS.find((s) => !bySeat.has(s.seat));
      if (free) bySeat.set(free.seat, p);
    });

  return (
    <div className="flex h-full w-full flex-1 items-center justify-center">
      <div className="relative aspect-[16/9] max-h-full w-full max-w-[1400px]">
        {/* Rectangular table felt */}
        <div className="absolute inset-[13%] rounded-[6rem] border-[10px] border-amber-950/80 bg-emerald-800 shadow-[inset_0_0_80px_rgba(0,0,0,0.6)]">
          <div className="absolute inset-5 rounded-[5rem] border border-emerald-600/40" />
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-3xl font-black tracking-widest text-emerald-300/30">
              ♠️ POKER LEAGUE ♥️
            </span>
          </div>
        </div>

        {/* Fixed seats */}
        {TABLE_SEATS.map(({ seat, left, top }) => {
          const player = bySeat.get(seat);

          return (
            <div
              key={seat}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-all duration-500"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              {player ? (
                <SeatOccupied
                  player={player}
                  name={displayNameOf(player)}
                  role={
                    player.playerId === dealerId
                      ? "dealer"
                      : player.playerId === sbId
                      ? "sb"
                      : null
                  }
                />
              ) : (
                <EmptySeat seat={seat} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeatOccupied({
  player,
  name,
  role,
}: {
  player: TablePlayer;
  name: string;
  role: "dealer" | "sb" | null;
}) {
  const eliminated = player.isEliminated;
  return (
    <>
      {/* Avatar + dealer/blind chip */}
      <div className="relative">
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-full border-[3px] text-2xl font-black shadow-lg transition ${
            eliminated
              ? "border-gray-700 bg-gray-900 text-gray-600 opacity-40 grayscale"
              : "border-emerald-400 bg-gray-900 text-emerald-300"
          }`}
        >
          {name.slice(0, 2).toUpperCase()}
        </div>

        {/* Dealer button (D) / Small blind (SB) chip */}
        {!eliminated && role === "dealer" && (
          <span
            title="Dealer (ciega alta)"
            className="absolute -right-1.5 -top-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-black bg-yellow-400 text-sm font-black text-black shadow-md"
          >
            D
          </span>
        )}
        {!eliminated && role === "sb" && (
          <span
            title="Ciega baja"
            className="absolute -right-1.5 -top-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-black bg-blue-500 text-[11px] font-black text-white shadow-md"
          >
            SB
          </span>
        )}
      </div>

      {/* Name + score */}
      <div className="mt-1.5 rounded-lg bg-black/80 px-3 py-1 text-center">
        <span
          className={`block max-w-[9rem] truncate text-lg font-bold leading-tight ${
            eliminated ? "text-gray-600 line-through" : "text-white"
          }`}
        >
          {name}
        </span>
        {!eliminated && (
          <span className="flex items-center justify-center gap-2 text-base font-black leading-tight">
            <span className="text-gray-400">F{player.handsFolded}</span>
            <span className="text-emerald-400">W{player.handsWon}</span>
            <span className={player.allIns > 0 ? "text-orange-400" : "text-gray-600"}>
              A{player.allIns}
            </span>
          </span>
        )}
      </div>
    </>
  );
}

function EmptySeat({ seat }: { seat: number }) {
  return (
    <div/>
    // <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-gray-800 text-sm font-bold text-gray-700 opacity-50">
    //   🪑
    // </div>
  );
}
