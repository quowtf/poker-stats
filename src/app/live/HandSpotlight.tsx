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
 * Full-screen spotlight for the just-played hand's insights. Shown for a few
 * seconds right after a new round is detected, then the view collapses to the
 * ranking table + news ticker. Rotates through the hand's insights while up.
 */
export default function HandSpotlight({
  insights,
  round,
}: {
  insights: Insight[];
  round: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (insights.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % insights.length);
    }, 2500);
    return () => clearInterval(id);
  }, [insights.length]);

  const current = insights[index] || null;

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-black px-8 text-white">
      {/* Round ribbon */}
      <div className="absolute top-10 flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-sm font-black uppercase tracking-[0.3em] text-gray-500">
          Ronda {round} · lo que pasó
        </span>
      </div>

      {current ? (
        <div key={current.id} className="animate-fade-in flex max-w-4xl flex-col items-center text-center">
          <span className="text-8xl">{current.emoji}</span>
          <p className="mt-8 text-5xl font-black leading-tight text-white">
            {current.message}
          </p>
        </div>
      ) : (
        <div className="animate-fade-in flex flex-col items-center text-center">
          <span className="text-8xl">🃏</span>
          <p className="mt-8 text-4xl font-black text-gray-400">Ronda {round}</p>
        </div>
      )}

      {/* Progress dots */}
      {insights.length > 1 && (
        <div className="absolute bottom-10 flex gap-2">
          {insights.map((ins, i) => (
            <div
              key={ins.id}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index ? "w-8 bg-emerald-400" : "w-2 bg-gray-700"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
