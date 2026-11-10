"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Insight } from "./types";

type NewsTickerProps = {
  insights: Insight[];
  /** Scoreboard shown as the card header. */
  header?: ReactNode;
};

/**
 * Single live panel: scoreboard + rotating hand-by-hand insights. The
 * scoreboard spans the card header; the current emoji sits back with the
 * insight message so it reads as part of the highlight, not a header control.
 */
export default function NewsTicker({ insights, header }: NewsTickerProps) {
  const [index, setIndex] = useState(0);
  const prevSignature = useRef("");

  // Only jump back to the first insight when the actual set changes. Polling
  // every 10s returns the same ids, and resetting on every poll made the ticker
  // restart mid-rotation.
  const signature = insights.map((insight) => insight.id).join("|");
  useEffect(() => {
    if (prevSignature.current === signature) return;
    prevSignature.current = signature;
    setIndex(0);
  }, [signature]);

  useEffect(() => {
    if (insights.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % insights.length);
    }, 7000);
    return () => clearInterval(id);
  }, [insights.length]);

  const safeIndex =
    insights.length > 0 ? Math.min(index, insights.length - 1) : 0;
  const current = insights[safeIndex] ?? null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-b from-gray-950 to-black">
      {/* Header: scoreboard only */}
      <div className="shrink-0 border-b border-emerald-500/15">
        {header ? <div className="min-w-0">{header}</div> : null}
      </div>

      {/* Insight */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-8 pb-[clamp(4rem,18vh,12rem)] pt-6 text-center">
        {current ? (
          // Key the whole block so the emoji and message swap together. A keyed
          // span on its own left stale emoji nodes behind across rotations.
          <div
            key={current.id}
            className="animate-fade-in flex min-w-0 flex-col items-center gap-6"
          >
            <span
              className="shrink-0 text-[clamp(3rem,4.5vw,6rem)] leading-none"
              aria-hidden
            >
              {current.emoji}
            </span>
            <p className="max-w-[26ch] text-balance text-[clamp(2.25rem,3.2vw,5rem)] font-black leading-[1.08] text-white">
              {current.message}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <span
              className="shrink-0 text-[clamp(3rem,4.5vw,6rem)] leading-none"
              aria-hidden
            >
              ♠️
            </span>
            <p className="text-[clamp(2.25rem,3.2vw,5rem)] font-bold leading-tight text-gray-600">
              Analizando la mesa mano a mano...
            </p>
          </div>
        )}

        {/* Progress dots */}
        {insights.length > 1 && (
          <div className="flex shrink-0 gap-2">
            {insights.map((ins, i) => (
              <div
                key={ins.id}
                className={`h-2 rounded-full transition-all ${
                  i === safeIndex ? "w-8 bg-emerald-400" : "w-2 bg-gray-700"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
