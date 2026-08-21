"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type SessionDetail = {
  id: string;
  playedAt: string;
  playerCount: number;
  notes: string | null;
  isLive: boolean;
  players: {
    playerId: string;
    playerName: string;
    playerNickname: string | null;
    finishPosition: number | null;
    buyIn: number | null;
    cashOut: number | null;
  }[];
};

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [togglingLive, setTogglingLive] = useState(false);

  useEffect(() => {
    fetch(`/api/poker/sessions/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  async function handleDelete() {
    if (!confirm("¿Eliminar esta sesión?")) return;
    setDeleting(true);
    const res = await fetch(`/api/poker/sessions/${params.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/admin/sessions");
    } else {
      setDeleting(false);
    }
  }

  async function handleCloseSession() {
    if (!confirm("¿Cerrar sesión? Se calcularán posiciones por orden de eliminación.")) return;
    const res = await fetch(`/api/poker/sessions/${params.id}/close`, {
      method: "POST",
    });
    if (res.ok) {
      // Reload session data
      const sessionRes = await fetch(`/api/poker/sessions/${params.id}`);
      const data = await sessionRes.json();
      setSession(data);
    } else {
      const data = await res.json();
      alert(data.error || "Error al cerrar sesión");
    }
  }

  async function handleToggleLive() {
    if (!session) return;
    setTogglingLive(true);
    const res = await fetch(`/api/poker/sessions/${params.id}/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLive: !session.isLive }),
    });
    if (res.ok) {
      setSession({ ...session, isLive: !session.isLive });
    }
    setTogglingLive(false);
  }

  if (loading) return <p className="text-center text-gray-500">Cargando...</p>;
  if (!session) return <p className="text-center text-gray-500">Sesión no encontrada</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {new Date(session.playedAt + "T12:00:00").toLocaleDateString("es-MX", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h1>
          <p className="text-sm text-gray-400">
            {session.playerCount} jugadores
          </p>
        </div>
        <Link href="/admin/sessions" className="text-sm text-gray-400 hover:text-white">
          ← Volver
        </Link>
      </div>

      {/* Positions table */}
      <div className="space-y-2">
        {session.players.map((p) => (
          <div
            key={p.playerId}
            className="flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                p.finishPosition === 1
                  ? "bg-yellow-500 text-black"
                  : p.finishPosition === 2
                  ? "bg-gray-300 text-black"
                  : p.finishPosition === 3
                  ? "bg-amber-700 text-white"
                  : p.finishPosition
                  ? "bg-gray-700 text-gray-300"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {p.finishPosition ?? "—"}
            </span>
            <span className="flex-1 font-medium">
              {p.playerNickname || p.playerName}
            </span>
            {p.finishPosition && (
              <span className="text-xs text-gray-500">#{p.finishPosition}</span>
            )}
          </div>
        ))}
      </div>

      {session.notes && (
        <p className="rounded-lg bg-gray-900 p-3 text-sm text-gray-400">
          {session.notes}
        </p>
      )}

      {/* Live toggle */}
      <button
        onClick={handleToggleLive}
        disabled={togglingLive}
        className={`w-full rounded-lg py-3 text-sm font-medium transition ${
          session.isLive
            ? "bg-red-600 text-white hover:bg-red-500"
            : "bg-emerald-600 text-white hover:bg-emerald-500"
        } disabled:opacity-50`}
      >
        {togglingLive
          ? "..."
          : session.isLive
          ? "🔴 Desactivar Live"
          : "📡 Activar Live"}
      </button>

      {/* Hands link */}
      <Link
        href={`/admin/sessions/${params.id}/hands`}
        className="block w-full rounded-lg bg-gray-800 py-3 text-center text-sm font-medium text-emerald-400 transition hover:bg-gray-700"
      >
        🃏 Registrar Manos
      </Link>

      {/* Close session (only if not yet closed) */}
      {!session.players.some((p) => p.finishPosition !== null) && (
        <button
          onClick={handleCloseSession}
          className="w-full rounded-lg bg-amber-600 py-3 text-sm font-medium text-white transition hover:bg-amber-500"
        >
          🏁 Cerrar Sesión (calcular posiciones)
        </button>
      )}

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="w-full rounded-lg border border-red-800 py-3 text-sm text-red-400 transition hover:bg-red-900/30 disabled:opacity-50"
      >
        {deleting ? "Eliminando..." : "Eliminar sesión"}
      </button>
    </div>
  );
}
