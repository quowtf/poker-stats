"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import StackedChart from "./StackedChart";

type ChartEvent = {
  handNumber: number;
  playerId: string;
  playerName: string;
  type: "allin_win" | "allin_survive" | "elimination" | "strong_hand" | "leader_change";
  emoji: string;
  label: string;
};

type RecapData = {
  session: { id: string; playedAt: string; playerCount: number; totalHands: number };
  players: { id: string; name: string; color: string; finishPosition: number | null }[];
  raceData: { handNumber: number; wins: Record<string, number> }[];
  winsSeries: { handNumber: number; values: Record<string, number> }[];
  survivalSeries: { handNumber: number; values: Record<string, number> }[];
  events: ChartEvent[];
  eliminatedAtHand: Record<string, number>;
  allInAtHands: { playerId: string; handNumber: number }[];
  mvps: { emoji: string; title: string; player: string; value: number }[];
  playerStats: Record<string, { handsWon: number; allIns: number; drinks: number; kills: number }>;
  timeline: { handNumber: number; events: string[] }[];
  insights: { emoji: string; message: string }[];
  topInsight: { emoji: string; message: string } | null;
};

export default function SessionRecapPage() {
  const params = useParams();
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/poker/sessions/${params.id}/recap`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-500">Cargando...</div>;
  if (!data || !data.session) return <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-500">Sesión no encontrada</div>;

  const winner = data.players.find((p) => p.finishPosition === 1);
  const winnerName = winner?.name || "?";

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-gray-950 px-4 py-8 text-gray-100">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">← Dashboard</Link>
        <p className="text-sm text-gray-500">
          {new Date(data.session.playedAt + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Winner banner */}
      <div className="mb-8 text-center">
        <p className="text-5xl mb-2">🏆</p>
        <p className="text-3xl font-black text-yellow-400">{winnerName}</p>
        <p className="text-gray-400">Ganador · {data.session.totalHands} manos · {data.session.playerCount} jugadores</p>
      </div>

      {/* Stacked Chart (AoE2 style) */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">La Noche en Gráfica</h2>
        <StackedChart
          players={data.players}
          winsSeries={data.winsSeries}
          survivalSeries={data.survivalSeries}
          events={data.events}
        />
      </section>

      {/* MVPs */}
      {data.mvps.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">MVPs de la noche</h2>
          <div className="grid grid-cols-2 gap-2">
            {data.mvps.map((mvp, i) => (
              <div key={i} className="rounded-lg bg-gray-900 p-3 text-center">
                <p className="text-2xl">{mvp.emoji}</p>
                <p className="font-bold text-white">{mvp.player}</p>
                <p className="text-xs text-gray-500">{mvp.title}: {mvp.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Player cards (tipo carta de futbol) */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">Scorecards</h2>
        <div className="grid grid-cols-2 gap-2">
          {data.players
            .sort((a, b) => (a.finishPosition || 99) - (b.finishPosition || 99))
            .map((player) => {
              const stats = data.playerStats[player.id];
              if (!stats) return null;
              const elimHand = data.eliminatedAtHand[player.id];
              return (
                <Link
                  key={player.id}
                  href={`/dashboard/players/${player.id}`}
                  className="rounded-xl bg-gray-900 p-3 transition hover:bg-gray-800 border-l-4"
                  style={{ borderLeftColor: player.color }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm">{player.name}</span>
                    <span className={`text-xs font-bold ${player.finishPosition === 1 ? "text-yellow-400" : "text-gray-500"}`}>
                      {player.finishPosition ? `${player.finishPosition}º` : "—"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-gray-500">Manos: <span className="text-white">{stats.handsWon}</span></span>
                    <span className="text-gray-500">Kills: <span className="text-white">{stats.kills}</span></span>
                    <span className="text-gray-500">All-in: <span className="text-white">{stats.allIns}</span></span>
                    <span className="text-gray-500">🍺 <span className="text-white">{stats.drinks}</span></span>
                  </div>
                  {elimHand && (
                    <p className="mt-1 text-[10px] text-gray-600">💀 Mano #{elimHand}</p>
                  )}
                </Link>
              );
            })}
        </div>
      </section>

      {/* Top insight */}
      {data.topInsight && (
        <section className="mb-8">
          <div className="rounded-xl bg-gray-900 p-4 text-center">
            <p className="text-3xl mb-2">{data.topInsight.emoji}</p>
            <p className="text-lg font-semibold text-gray-200">{data.topInsight.message}</p>
            <p className="text-xs text-gray-500 mt-1">Momento más dramático</p>
          </div>
        </section>
      )}

      {/* Timeline */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          Timeline ({data.timeline.length} momentos clave)
        </h2>
        <div className="max-h-80 overflow-y-auto space-y-1 rounded-xl bg-gray-900 p-3">
          {data.timeline.map((t) => (
            <div key={t.handNumber} className="flex gap-3 border-b border-gray-800/50 pb-1 last:border-0">
              <span className="text-xs text-gray-600 w-8 flex-shrink-0">#{t.handNumber}</span>
              <div className="text-xs text-gray-300 space-y-0.5">
                {t.events.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* All insights */}
      {data.insights.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Insights de la noche ({data.insights.length})
          </h2>
          <div className="max-h-60 overflow-y-auto space-y-1 rounded-xl bg-gray-900 p-3">
            {data.insights.map((insight, i) => (
              <p key={i} className="text-xs text-gray-300">
                <span className="mr-1">{insight.emoji}</span>
                {insight.message}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Final positions */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">Posiciones Finales</h2>
        <div className="space-y-1">
          {data.players
            .sort((a, b) => (a.finishPosition || 99) - (b.finishPosition || 99))
            .map((player) => (
              <div key={player.id} className="flex items-center gap-3 rounded-lg bg-gray-900 px-3 py-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  player.finishPosition === 1 ? "bg-yellow-500 text-black"
                  : player.finishPosition === 2 ? "bg-gray-300 text-black"
                  : player.finishPosition === 3 ? "bg-amber-700 text-white"
                  : "bg-gray-700 text-gray-400"
                }`}>
                  {player.finishPosition || "—"}
                </span>
                <span className="text-sm font-medium">{player.name}</span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
