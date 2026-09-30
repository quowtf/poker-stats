"use client";

import { SEAT_COUNT } from "@/app/live/tableSeats";

type Player = {
  id: string;
  name: string;
  nickname: string | null;
};

type SeatingBoardProps = {
  players: Player[];
  /** Map of playerId → seat number (0-based). Absent = not selected. */
  seats: Map<string, number>;
  /** The playerId of the initial dealer, or null if none picked. */
  dealerId: string | null;
  /** Tap the player name: select (next free seat) / deselect. */
  onToggle: (playerId: string) => void;
  /** Tap the seat badge: advance seat by +1 (to the next free seat). */
  onAdvanceSeat: (playerId: string) => void;
  /** Tap the dealer badge: mark this player as the initial dealer. */
  onSetDealer: (playerId: string) => void;
};

/**
 * Player selection grid (2 columns). Tapping a name selects the player and
 * assigns the next free seat, showing a seat badge (a0, a1, …). Tapping the
 * badge advances the seat by +1 so empty seats can be skipped. Tapping the
 * name again deselects.
 */
export default function SeatingBoard({
  players,
  seats,
  dealerId,
  onToggle,
  onAdvanceSeat,
  onSetDealer,
}: SeatingBoardProps) {
  const displayNameOf = (p: Player) => p.nickname || p.name;

  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((player) => {
        const seat = seats.get(player.id);
        const isSelected = seat !== undefined;
        const isDealer = dealerId === player.id;
        return (
          <div
            key={player.id}
            className={`flex items-center gap-1 rounded-lg transition ${
              isSelected ? "bg-emerald-600" : "bg-gray-800"
            }`}
          >
            {/* Name → select / deselect */}
            <button
              type="button"
              onClick={() => onToggle(player.id)}
              className={`flex-1 truncate rounded-lg px-3 py-3 text-left text-sm font-medium transition active:scale-95 ${
                isSelected ? "text-white" : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              {displayNameOf(player)}
            </button>

            {/* Dealer badge → mark as initial dealer */}
            {isSelected && (
              <button
                type="button"
                onClick={() => onSetDealer(player.id)}
                title="Marcar como Dealer inicial"
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition active:scale-90 ${
                  isDealer
                    ? "bg-yellow-500 text-black shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                    : "bg-black/40 text-gray-400 hover:bg-black/60 hover:text-white"
                }`}
              >
                D
              </button>
            )}

            {/* Seat badge → advance seat by +1 */}
            {isSelected && (
              <button
                type="button"
                onClick={() => onAdvanceSeat(player.id)}
                title="Tap para avanzar de asiento"
                className="mr-1.5 flex h-8 min-w-9 items-center justify-center rounded-full bg-black/40 px-2 text-xs font-black text-white transition active:scale-90 hover:bg-black/60"
              >
                a{seat}
              </button>
            )}
          </div>
        );
      })}
      {players.length > 0 && (
        <p className="col-span-2 mt-1 text-center text-xs text-gray-500">
          Tap al nombre para sentar/quitar. <strong>D</strong> = Dealer inicial.
          Tap al asiento (a0…a{SEAT_COUNT - 1}) para avanzar.
        </p>
      )}
    </div>
  );
}
