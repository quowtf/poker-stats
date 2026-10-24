"use client";

import { useEffect, useState } from "react";
import {
  BLIND_LEVELS,
  blindLevelIndex,
  handsToNextLevel,
  blindsForRound,
  type HeadsUpMode,
} from "./blinds";
type ScoreboardProps = {
  round: number;
  startedAt: string; // ISO
  /** Alive players — when 2, heads-up blinds may apply. */
  playersAlive?: number;
  /** Heads-up mode for the session. */
  headsUpMode?: HeadsUpMode | null;
};

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${pad2(m)}:${pad2(sec)}`;
}

/**
 * TV-style corner scoreboards. Two small fixed panels:
 *  - top-left: current round + elapsed clock
 *  - top-right: blinds + hands until the blinds go up
 * They sit above the table without stealing space from the felt/players.
 */
export default function Scoreboard({ round, startedAt, playersAlive, headsUpMode }: ScoreboardProps) {
  // Local ticking clock so elapsed time advances between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(startedAt).getTime();
  const elapsedSec = Math.max(0, (now - start) / 1000);

  // Heads-up = exactly 2 players alive. Fixed-blind modes override the curve.
  const isHeadsUp = playersAlive === 2;
  const fixedByMode = isHeadsUp && headsUpMode && headsUpMode !== "natura";

  // Blinds go up every few hands (see blinds.ts), unless a heads-up mode fixes them.
  const levelIndex = blindLevelIndex(round);
  const level = blindsForRound(round, { isHeadsUp, mode: headsUpMode });
  const isMaxLevel = levelIndex >= BLIND_LEVELS.length - 1;
  const handsToNext = handsToNextLevel(round);

  return (
    <div className="shrink-0 self-center overflow-hidden rounded-xl border border-gray-700 bg-gray-900/90 shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
      {/* Row 1: ROUND + elapsed clock */}
      <div className="flex items-stretch">
        <div className="flex items-center bg-emerald-500 px-3">
          <span className="text-xs font-black uppercase leading-none tracking-widest text-black">
            Ronda
          </span>
        </div>
        <div className="flex items-center px-4 py-2">
          <span className="font-mono text-4xl font-black tabular-nums leading-none text-white">
            {pad2(round)}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center border-l border-gray-700 bg-black/50 px-4 py-2">
          <span className="text-[10px] font-black uppercase leading-none tracking-widest text-gray-500">
            Tiempo total
          </span>
          <span className="mt-1 font-mono text-xl font-black tabular-nums leading-none text-cyan-400">
            {formatClock(elapsedSec)}
          </span>
        </div>
      </div>
      {/* Row 2: blinds + next level */}
      <div className="flex items-stretch border-t border-gray-700">
        <div className="flex flex-col items-center justify-center px-4 py-2">
          <span className="text-[10px] font-black uppercase leading-none tracking-widest text-amber-400">
            {fixedByMode ? "Ciegas · Final" : "Ciega Baja : Alta"}
          </span>
          <span className="mt-1 font-mono text-2xl font-black tabular-nums leading-none text-white">
            {level.sb}
            <span className="px-0.5 text-gray-600">:</span>
            {level.bb}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center border-l border-gray-700 bg-black/50 px-4 py-2">
          <span className="text-[10px] font-black uppercase leading-none tracking-widest text-gray-500">
            {fixedByMode ? "Formato" : isMaxLevel ? "Nivel" : "Sube en"}
          </span>
          <span className="mt-1 whitespace-nowrap font-mono text-lg font-black tabular-nums leading-none text-emerald-400">
            {fixedByMode
              ? headsUpMode === "best_of_5"
                ? "Mejor de 5"
                : "50/50"
              : isMaxLevel
              ? "MAX"
              : `${handsToNext} ${handsToNext === 1 ? "ronda" : "rondas"}`}
          </span>
        </div>
      </div>
    </div>
  );
}
