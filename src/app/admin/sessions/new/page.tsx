"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Player = {
  id: string;
  name: string;
  nickname: string | null;
};

export default function NewSessionPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/poker/players")
      .then((r) => r.json())
      .then(setPlayers)
      .catch(() => setError("Error loading players"));
  }, []);

  function togglePlayer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(players.map((p) => p.id)));
  }

  async function handleSubmit() {
    if (selectedIds.size < 2) {
      setError("Mínimo 2 jugadores");
      return;
    }

    setLoading(true);
    setError("");

    const res = await fetch("/api/poker/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playedAt: date,
        playerIds: [...selectedIds],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/admin/sessions/${data.id}`);
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

      {/* Player selection */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm text-gray-400">
            Jugadores ({selectedIds.size} seleccionados)
          </label>
          <button
            onClick={selectAll}
            className="text-xs text-emerald-400 hover:underline"
          >
            Seleccionar todos
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {players.map((player) => {
            const isSelected = selectedIds.has(player.id);
            return (
              <button
                key={player.id}
                onClick={() => togglePlayer(player.id)}
                className={`rounded-lg px-4 py-3 text-sm font-medium transition active:scale-95 ${
                  isSelected
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {player.nickname || player.name}
              </button>
            );
          })}
        </div>
        {players.length === 0 && (
          <p className="text-center text-sm text-gray-500">
            No hay jugadores. Créalos primero.
          </p>
        )}
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
        disabled={loading || selectedIds.size < 2}
        className="w-full rounded-lg bg-emerald-600 py-4 text-lg font-bold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? "Creando..." : "Iniciar Sesión"}
      </button>
    </div>
  );
}
