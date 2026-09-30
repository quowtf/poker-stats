"use client";

import { useEffect, useState } from "react";

type Insight = {
  id: string;
  emoji: string;
  message: string;
  type: string;
  createdAt: string;
};

/**
 * Phase 3 news ticker: a big TV-style chyron pinned to the bottom that rotates
 * hand-by-hand insights (the non-obvious narrative players can't compute in
 * their heads). Sits below the ranking table.
 */
export default function NewsTicker({ insights }: { insights: Insight[] }) {
  const [index, setIndex] = useState(0);

  // Reset to the newest insight whenever the set changes (new hand).
  useEffect(() => {
    setIndex(0);
  }, [insights.length, insights[0]?.id]);

  useEffect(() => {
    if (insights.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % insights.length);
    }, 4000);
    return () => clearInterval(id);
  }, [insights.length]);

  const current = insights[index] || null;

  return (
    <div className="flex items-center gap-4 border-t-2 border-emerald-500/30 bg-gradient-to-r from-gray-950 to-black px-8 py-5">
      {/* Live badge */}
      {/* <div className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
          Ronda pasada
        </span>
      </div> */}

      {/* Insight */}
      {current ? (
        <div key={current.id} className="animate-fade-in flex min-w-0 flex-1 items-center gap-4">
          <span className="text-4xl">{current.emoji}</span>
          <p className="truncate text-3xl font-black text-white">{current.message}</p>
        </div>
      ) : (
        <p className="flex-1 text-xl font-bold text-gray-600">
          Analizando la mesa mano a mano...
        </p>
      )}

      {/* Progress dots */}
      {insights.length > 1 && (
        <div className="flex shrink-0 gap-1.5">
          {insights.map((ins, i) => (
            <div
              key={ins.id}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-emerald-400" : "w-1.5 bg-gray-700"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
