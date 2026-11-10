"use client";

import { useEffect, useState } from "react";
import {
  BLIND_LEVELS,
  blindLevelIndex,
  handsToNextLevel,
  blindsForRound,
  type HeadsUpMode,
} from "./blinds";
import { HEADER_LABEL } from "./live-ui";
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

const VALUE = "mt-1 font-mono font-black tabular-nums leading-none";

/**
 * Embedded round/blinds scoreboard. It is designed to sit inside the live
 * highlights card, so it has no outer card shell of its own.
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
    <div className="grid h-full w-full grid-cols-4 divide-x divide-gray-700/80 overflow-hidden bg-gray-900/70">
      {/* Round */}
      <div className="flex min-w-0 flex-col items-center justify-center px-1.5 py-2">
        <span className={`${HEADER_LABEL} whitespace-nowrap text-gray-500`}>Ronda</span>
        <span className={`${VALUE} text-[clamp(1.5rem,2vw,2.75rem)] text-white`}>
          {pad2(round)}
        </span>
      </div>

      {/* Blinds — big blind first */}
      <div className="flex min-w-0 flex-col items-center justify-center px-1.5 py-2">
        <span className={`${HEADER_LABEL} whitespace-nowrap text-gray-500`}>
          {fixedByMode ? "Ciegas · Final" : "Ciega Alta : Baja"}
        </span>
        <span className={`${VALUE} text-[clamp(1.3rem,1.65vw,2.25rem)] text-white`}>
          {level.bb}
          <span className="px-0.5 text-gray-600">:</span>
          {level.sb}
        </span>
      </div>

      {/* Next level */}
      <div className="flex min-w-0 flex-col items-center justify-center px-1.5 py-2">
        <span className={`${HEADER_LABEL} whitespace-nowrap text-gray-500`}>
          {fixedByMode ? "Formato" : isMaxLevel ? "Nivel" : "Sube en"}
        </span>
        <span
          className={`${VALUE} whitespace-nowrap text-[clamp(1.3rem,1.65vw,2.25rem)] text-white`}
        >
          {fixedByMode
            ? headsUpMode === "best_of_5"
              ? "Mejor de 5"
              : "50/50"
            : isMaxLevel
            ? "MAX"
            : `${handsToNext} ${handsToNext === 1 ? "ronda" : "rondas"}`}
        </span>
      </div>

      {/* Elapsed clock */}
      <div className="flex min-w-0 flex-col items-center justify-center px-1.5 py-2">
        <span className={`${HEADER_LABEL} text-gray-500`}>Tiempo total</span>
        <span className={`${VALUE} text-[clamp(1.05rem,1.35vw,1.75rem)] text-white`}>
          {formatClock(elapsedSec)}
        </span>
      </div>
    </div>
  );
}
