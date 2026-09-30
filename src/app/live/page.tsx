"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import StackedChart from "../dashboard/sessions/[id]/StackedChart";
import Scoreboard from "./Scoreboard";
import PreGameShow, { type PreGameCard } from "./PreGameShow";
import PreGameMesa from "./PreGameMesa";
import RankingTable from "./RankingTable";
import NewsTicker from "./NewsTicker";
import HandSpotlight from "./HandSpotlight";

// How long the full-screen hand spotlight stays up after a new round.
const HAND_SPOTLIGHT_MS = 8000;

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

type Insight = {
  id: string;
  emoji: string;
  message: string;
  type: string;
  createdAt: string;
};

type ScoreboardData = {
  playersAlive: number;
  playersOut: number;
  totalPlayers: number;
  totalAllIns: number;
  totalEliminations: number;
  leader: { playerId: string; name: string; handsWon: number } | null;
  topKiller: { playerId: string; name: string; kills: number } | null;
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
    startedAt: string;
    lastHandAt: string | null;
    dealerId: string | null;
    sbId: string | null;
    headsUpMode: "natura" | "best_of_5" | "best_of_3";
  } | null;
  scoreboard: ScoreboardData;
  ranking: RankingEntry[];
  seatedPlayers: RankingEntry[];
  insights: Insight[];
};

export default function LivePage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [pregameCards, setPregameCards] = useState<PreGameCard[] | null>(null);
  const [pregamePhase, setPregamePhase] = useState<0 | 1>(0); // 0 = mesa, 1 = spotlights
  const [showWinner, setShowWinner] = useState(false);
  // When true, the just-played hand's insights take the full screen (8s).
  const [handSpotlight, setHandSpotlight] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const spotlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevHandCount = useRef(0);
  // Guard so the very first load doesn't trigger a spotlight retroactively.
  const initializedHandCount = useRef(false);

  useEffect(() => {
    async function fetchLive() {
      try {
        const res = await fetch("/api/poker/live");
        const json: LiveData = await res.json();
        setData(json);

        const handCount = json.session?.handCount ?? 0;
        if (handCount !== prevHandCount.current) {
          const increased = handCount > prevHandCount.current;
          prevHandCount.current = handCount;
          // Only fire the big spotlight on a real round increment while playing
          // (skip the initial load and pre-game round 0).
          if (initializedHandCount.current && increased && handCount > 0) {
            setHandSpotlight(true);
            if (spotlightTimerRef.current) clearTimeout(spotlightTimerRef.current);
            spotlightTimerRef.current = setTimeout(
              () => setHandSpotlight(false),
              HAND_SPOTLIGHT_MS
            );
          }
          initializedHandCount.current = true;
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
    intervalRef.current = setInterval(fetchLive, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (spotlightTimerRef.current) clearTimeout(spotlightTimerRef.current);
    };
  }, [showWinner]);

  // Fetch pre-game insight cards once, while live and no hands played yet.
  const isPreGame = !!data?.isLive && data.session?.handCount === 0;
  useEffect(() => {
    if (!isPreGame || pregameCards !== null) return;
    fetch("/api/poker/live/pregame")
      .then((r) => r.json())
      .then((json) => setPregameCards(json.cards ?? []))
      .catch(() => setPregameCards([]));
  }, [isPreGame, pregameCards]);

  // Pre-game sequence: show the mesa (with blind structure) first, then advance
  // to the predictive spotlights.
  useEffect(() => {
    if (!isPreGame) { setPregamePhase(0); return; }
    if (pregamePhase !== 0) return;
    const t = setTimeout(() => setPregamePhase(1), 12000);
    return () => clearTimeout(t);
  }, [isPreGame, pregamePhase]);

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

  // ─── Pre-game (session live, no hands played yet) ───────────────────────────
  // Phase 0: the table + blind structure. Phase 1: predictive spotlights.

  if (isPreGame) {
    if (pregamePhase === 0) {
      return <PreGameMesa players={data.seatedPlayers ?? []} />;
    }
    return <PreGameShow cards={pregameCards ?? []} />;
  }

  // ─── Hand spotlight: 8s full-screen after each new round ────────────────────

  if (handSpotlight) {
    return <HandSpotlight insights={data.insights} round={data.session.handCount} />;
  }

  // ─── Live view (Phase 3): ranking table + news ticker ───────────────────────

  const { ranking, session, insights, scoreboard } = data;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-black text-white">
      {/* TV-style corner scoreboards (absolute overlays) */}
      <Scoreboard
        round={session.handCount}
        startedAt={session.startedAt}
        playersAlive={scoreboard.playersAlive}
        headsUpMode={session.headsUpMode}
      />

      {/* Ranking table — takes the remaining height. Top padding clears the
          corner scoreboard panels. */}
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-2 pt-24">
        <RankingTable players={ranking} />
      </div>

      {/* News ticker — big bottom band with hand-by-hand insights */}
      <NewsTicker insights={insights} />
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

  // No auto-advance: the winner screen stays put so players have time to
  // celebrate and take a photo. It only advances on tap.

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
          <p className="mt-12 text-sm text-gray-600">📸 tómense la foto — toca la pantalla para ver el resumen →</p>
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
