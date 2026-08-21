"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Player = {
  id: string;
  name: string;
  nickname: string | null;
  createdAt: string;
};

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/poker/players")
      .then((r) => r.json())
      .then((data) => {
        setPlayers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-center text-gray-500">Cargando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Jugadores</h1>
        <Link
          href="/admin/players/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          + Nuevo
        </Link>
      </div>

      {players.length === 0 ? (
        <div className="rounded-lg bg-gray-900 p-8 text-center">
          <p className="text-gray-400">No hay jugadores registrados</p>
          <Link
            href="/admin/players/new"
            className="mt-3 inline-block text-emerald-400 hover:underline"
          >
            Agrega el primero
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {players.map((player) => (
            <Link
              key={player.id}
              href={`/admin/players/${player.id}`}
              className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-3 transition hover:bg-gray-800"
            >
              <div>
                <p className="font-medium">{player.name}</p>
                {player.nickname && (
                  <p className="text-sm text-gray-400">{player.nickname}</p>
                )}
              </div>
              <span className="text-xs text-gray-600">editar →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
