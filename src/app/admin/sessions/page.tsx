"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Session = {
  id: string;
  playedAt: string;
  playerCount: number;
  winner: string | null;
  notes: string | null;
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/poker/sessions")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data);
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
        <h1 className="text-xl font-bold">Sesiones</h1>
        <Link
          href="/admin/sessions/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          + Nueva
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg bg-gray-900 p-8 text-center">
          <p className="text-gray-400">No hay sesiones registradas</p>
          <Link
            href="/admin/sessions/new"
            className="mt-3 inline-block text-emerald-400 hover:underline"
          >
            Registra la primera
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/admin/sessions/${session.id}`}
              className="block rounded-lg bg-gray-900 p-4 transition hover:bg-gray-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {new Date(session.playedAt + "T12:00:00").toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-sm text-gray-400">
                    {session.playerCount} jugadores
                  </p>
                </div>
                <div className="text-right">
                  {session.winner && (
                    <p className="text-sm">
                      🏆 <span className="font-medium">{session.winner}</span>
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
