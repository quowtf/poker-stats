"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SeatingBoard from "./SeatingBoard";
import { SEAT_COUNT } from "@/app/live/tableSeats";
import { HEADS_UP_MODES, type HeadsUpMode } from "@/app/live/blinds";

type Player = {
  id: string;
  name: string;
  nickname: string | null;
};

export default function NewSessionPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  // playerId → seat number (0-based). Presence = seated/selected.
  const [seats, setSeats] = useState<Map<string, number>>(new Map());
  // Initial dealer (D = big blind; SB is the next occupied seat to the left).
  const [dealerId, setDealerId] = useState<string | null>(null);
  // Heads-up (1v1 final) mode — informative, drives blinds at 2 players.
  const [headsUpMode, setHeadsUpMode] = useState<HeadsUpMode>("natura");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/poker/players")
      .then((r) => r.json())
      .then(setPlayers)
      .catch(() => setError("Error loading players"));
  }, []);

  /** Tap the name: select (assign lowest free seat) or deselect. */
  function togglePlayer(playerId: string) {
    setSeats((prev) => {
      const next = new Map(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
        // Deselecting the dealer clears the dealer pick.
        setDealerId((d) => (d === playerId ? null : d));
        return next;
      }
      const taken = new Set(next.values());
      for (let s = 0; s < SEAT_COUNT; s++) {
        if (!taken.has(s)) {
          next.set(playerId, s);
          break;
        }
      }
      return next;
    });
  }

  /** Tap the dealer badge: set/unset this player as the initial dealer. */
  function setDealer(playerId: string) {
    setDealerId((prev) => (prev === playerId ? null : playerId));
  }

  /** Tap the seat badge: advance to the next free seat (+1, wrapping). */
  function advanceSeat(playerId: string) {
    setSeats((prev) => {
      const current = prev.get(playerId);
      if (current === undefined) return prev;
      const currentSeat: number = current;

      const next = new Map(prev);
      const taken = new Set<number>(next.values());
      taken.delete(currentSeat);

      for (let step = 1; step <= SEAT_COUNT; step++) {
        const candidate: number = (currentSeat + step) % SEAT_COUNT;
        if (candidate === currentSeat) break;
        if (!taken.has(candidate)) {
          next.set(playerId, candidate);
          break;
        }
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (seats.size < 2) {
      setError("Mínimo 2 jugadores");
      return;
    }
    if (!dealerId) {
      setError("Marca al Dealer inicial (botón D)");
      return;
    }

    setLoading(true);
    setError("");

    // Order players by seat number so the API stores seatOrder = array index.
    const playerIds = [...seats.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([playerId]) => playerId);

    // Explicit seat per player (preserves gaps like skipping a3 for a4).
    const seatAssignments = playerIds.map((playerId) => ({
      playerId,
      seat: seats.get(playerId)!,
    }));

    const res = await fetch("/api/poker/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playedAt: date,
        playerIds,
        seats: seatAssignments,
        headsUpMode,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      // Carry the initial dealer to the session page so the first hand can
      // pre-fill Dealer/SB. Only the first hand uses it; then it rotates.
      router.push(`/admin/sessions/${data.id}?dealer=${dealerId}`);
    } else {
      const data = await res.json();
      setError(data.error || "Error al crear");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <h1 className="text-xl font-bold">Nueva Sesión</h1>

      {/* Date */}
      <div>
        <label className="mb-1 block text-sm text-gray-400">Fecha</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg bg-gray-800 px-4 py-3 text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Seat assignment */}
      <div>
        <label className="mb-2 block text-sm text-gray-400">
          Jugadores y asientos ({seats.size} sentados)
        </label>
        {players.length === 0 ? (
          <p className="text-center text-sm text-gray-500">
            No hay jugadores. Créalos primero.
          </p>
        ) : (
          <SeatingBoard
            players={players}
            seats={seats}
            dealerId={dealerId}
            onToggle={togglePlayer}
            onAdvanceSeat={advanceSeat}
            onSetDealer={setDealer}
          />
        )}
      </div>

      {/* Heads-up (1v1 final) mode */}
      <div>
        <label className="mb-2 block text-sm text-gray-400">
          Modo del 1v1 final (heads-up)
        </label>
        <div className="grid grid-cols-1 gap-2">
          {HEADS_UP_MODES.map((m) => {
            const active = headsUpMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setHeadsUpMode(m.id)}
                className={`flex items-start gap-3 rounded-lg px-4 py-3 text-left transition active:scale-[0.99] ${
                  active
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                <span className="text-2xl leading-none">{m.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{m.title}</span>
                  <span
                    className={`block text-xs ${active ? "text-emerald-100" : "text-gray-500"}`}
                  >
                    {m.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="rounded bg-red-900/50 p-2 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading || seats.size < 2}
        className="w-full rounded-lg bg-emerald-600 py-4 text-lg font-bold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? "Creando..." : "Iniciar Sesión"}
      </button>
    </div>
  );
}
