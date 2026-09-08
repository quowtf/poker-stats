"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import StackedChart from "../dashboard/sessions/[id]/StackedChart";

type RankingEntry = {
  playerId: string;
  name: string;
  nickname: string | null;
  handsWon: number;
  handsPlayed: number;
  handsFolded: number;
  allIns: number;
  isEliminated: boolean;
};

type Insight = {
  id: string;
  emoji: string;
  message: string;
  type: string;
  createdAt: string;
};

type LiveData = {
  isLive: boolean;
  isFinished: boolean;
  winner: RankingEntry | null;
  session: {
    id: string;
    playedAt: string;
    playerCount: number;
    handCount: number;
  } | null;
  ranking: RankingEntry[];
  insights: Insight[];
};

export default function LivePage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [insightIndex, setInsightIndex] = useState(0);
  const [showWinner, setShowWinner] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const insightRotateRef = useRef<NodeJS.Timeout | null>(null);
  const prevHandCount = useRef(0);

  useEffect(() => {
    async function fetchLive() {
      try {
        const res = await fetch("/api/poker/live");
        const json: LiveData = await res.json();
        setData(json);

        if (json.session && json.session.handCount !== prevHandCount.current) {
          prevHandCount.current = json.session.handCount;
          setInsightIndex(0);
        }

        // Show winner screen
        if (json.isFinished && !showWinner) {
          setShowWinner(true);
          // Auto-close session
          if (json.session) {
            fetch(`/api/poker/sessions/${json.session.id}/close`, { method: "POST" }).catch(() => {});
          }
        }

        if (!json.isLive && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } catch {
        // silent
      }
    }

    fetchLive();
    intervalRef.current = setInterval(fetchLive, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [showWinner]);

  useEffect(() => {
    if (!data?.insights || data.insights.length <= 1) return;
    insightRotateRef.current = setInterval(() => {
      setInsightIndex((prev) => (prev + 1) % (data.insights.length || 1));
    }, 3000);
    return () => { if (insightRotateRef.current) clearInterval(insightRotateRef.current); };
  }, [data?.insights?.length]);

  // ─── Not live ──────────────────────────────────────────────────────────────

  if (!data || !data.isLive || !data.session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-6xl">🃏</p>
          <p className="mt-6 text-3xl font-bold text-gray-500">
            No hay sesión en vivo
          </p>
        </div>
      </div>
    );
  }

  // ─── Winner screen ─────────────────────────────────────────────────────────

  if (showWinner && data.winner) {
    const winnerName = data.winner.nickname || data.winner.name;
    return <WinnerSlider winner={data.winner} winnerName={winnerName} sessionId={data.session!.id} handCount={data.session!.handCount} />;
  }

  // ─── Live view ─────────────────────────────────────────────────────────────

  const { ranking, insights, session } = data;
  const alivePlayers = ranking.filter((r) => !r.isEliminated);
  const eliminatedPlayers = ranking.filter((r) => r.isEliminated);
  const currentInsight = insights[insightIndex] || null;

  return (
    <div className="flex min-h-screen flex-col bg-black text-white p-5">
      {/* Header */}
      <header className="mb-3 flex items-center justify-between">
        <span className="text-3xl font-black text-emerald-400">
          Ronda #{session.handCount}
        </span>
        <h1 className="mb-2 text-center text-3xl font-bold">Poker League</h1>
        <div className="text-base text-gray-500">
          ♥️♣️♦️♠️
        </div>
      </header>

      {/* Stats table header */}
      <div className="grid grid-cols-[2.5rem_1fr_3.5rem_3.5rem_3.5rem_3.5rem] gap-1 px-1 mb-1 text-xs text-gray-600 uppercase tracking-wider">
        <span></span>
        <span></span>
        <span className="text-center">Fold</span>
        <span className="text-center">Play</span>
        <span className="text-center">A-I</span>
        <span className="text-center">Win</span>
      </div>

      {/* Ranking rows */}
      <div className="flex-1 space-y-1">
        {alivePlayers.map((entry, i) => {
          const displayName = entry.nickname || entry.name;
          return (
            <div
              key={entry.playerId}
              className="grid grid-cols-[2.5rem_1fr_3.5rem_3.5rem_3.5rem_3.5rem] items-center gap-1 rounded-lg bg-gray-900/60 px-1 py-2 transition-all duration-500"
            >
              {/* Position */}
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${
                  i === 0
                    ? "bg-yellow-500 text-black"
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
              <span className="truncate text-xl font-bold pl-2">
                {displayName}
              </span>

              {/* Fold count */}
              <span className="text-center text-lg text-gray-500">
                {entry.handsFolded}
              </span>

              {/* Played count */}
              <span className="text-center text-lg text-gray-400">
                {entry.handsPlayed}
              </span>

              {/* All-in count */}
              <span className={`text-center text-lg ${entry.allIns > 0 ? "text-orange-400" : "text-gray-600"}`}>
                {entry.allIns}
              </span>

              {/* Wins */}
              <span className="text-center text-lg font-bold text-emerald-400">
                {entry.handsWon}
              </span>
            </div>
          );
        })}

        {/* Eliminated */}
        {eliminatedPlayers.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-800 mt-1">
            {eliminatedPlayers.map((entry) => (
              <span
                key={entry.playerId}
                className="text-sm text-gray-600 line-through"
              >
                {entry.nickname || entry.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Insights - bottom */}
      {currentInsight && (
        <div className="mt-3 border-t border-gray-800 pt-3">
          <div
            key={currentInsight.id}
            className="flex items-center justify-center gap-3 animate-fade-in"
          >
            <span className="text-4xl">{currentInsight.emoji}</span>
            <p className="text-lg font-semibold text-gray-200">
              {currentInsight.message}
            </p>
          </div>
          {insights.length > 1 && (
            <div className="mt-2 flex justify-center gap-2">
              {insights.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === insightIndex ? "bg-emerald-400 w-4" : "bg-gray-700 w-1.5"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Winner Slider Component ─────────────────────────────────────────────────

function WinnerSlider({
  winner,
  winnerName,
  sessionId,
  handCount,
}: {
  winner: RankingEntry;
  winnerName: string;
  sessionId: string;
  handCount: number;
}) {
  const [slide, setSlide] = useState(0); // 0 = winner, 1 = chart
  const [recapData, setRecapData] = useState<{
    players: { id: string; name: string; color: string; finishPosition: number | null }[];
    dominionSeries: { handNumber: number; values: Record<string, number> }[];
    events: {
      handNumber: number; playerId: string; playerName: string;
      type: "allin_win" | "allin_survive" | "elimination" | "strong_hand" | "leader_change";
      emoji: string; label: string;
    }[];
  } | null>(null);

  // Auto advance to chart after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => setSlide(1), 8000);
    return () => clearTimeout(timer);
  }, []);

  // Load recap data for chart
  useEffect(() => {
    fetch(`/api/poker/sessions/${sessionId}/recap`)
      .then((r) => r.json())
      .then((data) => setRecapData(data))
      .catch(() => {});
  }, [sessionId]);

  if (slide === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white" onClick={() => setSlide(1)}>
        <div className="animate-fade-in text-center">
          <p className="text-8xl mb-6">🏆</p>
          <p className="text-6xl font-black text-yellow-400 mb-4">{winnerName}</p>
          <p className="text-2xl text-gray-400">Ganador de la mesa</p>
          <div className="mt-8 flex gap-8 text-lg text-gray-500">
            <span>{handCount} manos</span>
            <span>{winner.handsWon} ganadas</span>
            <span>{winner.allIns} all-ins</span>
          </div>
          <p className="mt-12 text-sm text-gray-700 animate-pulse">tap para ver resumen →</p>
        </div>
        {/* Dots */}
        <div className="absolute bottom-8 flex gap-2">
          <div className="h-2 w-6 rounded-full bg-emerald-400" />
          <div className="h-2 w-2 rounded-full bg-gray-700" />
        </div>
      </div>
    );
  }

  // Slide 1: Dominio stacked chart
  return (
    <div className="flex min-h-screen flex-col bg-black text-white p-6" onClick={() => setSlide(0)}>
      <h2 className="text-center text-xl font-bold text-gray-400 mb-4">Dominio de la Mesa</h2>
      <div className="flex-1 rounded-xl bg-gray-900 p-4 flex items-center">
        {recapData ? (
          <div className="w-full">
            <StackedChart
              players={recapData.players}
              dominionSeries={recapData.dominionSeries}
              events={recapData.events}
            />
          </div>
        ) : (
          <p className="w-full text-center text-gray-600">Cargando gráfica...</p>
        )}
      </div>
      <Link
        href={`/dashboard/sessions/${sessionId}`}
        className="mt-4 block text-center rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-500 transition"
      >
        Ver resumen completo →
      </Link>
      {/* Dots */}
      <div className="mt-4 flex justify-center gap-2">
        <div className="h-2 w-2 rounded-full bg-gray-700" />
        <div className="h-2 w-6 rounded-full bg-emerald-400" />
      </div>
    </div>
  );
}
