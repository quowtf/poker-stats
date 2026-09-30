"use client";

import { useEffect, useState } from "react";

export type PreGameCard = {
  id: string;
  emoji: string;
  headline: string;
  subtitle: string;
  accent: "emerald" | "amber" | "red" | "cyan" | "yellow";
};

const ACCENT_TEXT: Record<PreGameCard["accent"], string> = {
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  red: "text-red-400",
  cyan: "text-cyan-400",
  yellow: "text-yellow-400",
};

const ACCENT_GLOW: Record<PreGameCard["accent"], string> = {
  emerald: "shadow-[0_0_120px_rgba(16,185,129,0.25)]",
  amber: "shadow-[0_0_120px_rgba(245,158,11,0.25)]",
  red: "shadow-[0_0_120px_rgba(239,68,68,0.25)]",
  cyan: "shadow-[0_0_120px_rgba(34,211,238,0.25)]",
  yellow: "shadow-[0_0_120px_rgba(234,179,8,0.25)]",
};

const SLIDE_MS = 6000;

/**
 * Full-screen "pre-game show": rotates narrative/predictive insight cards
 * about tonight's players before the first hand is played (ronda 0).
 */
export default function PreGameShow({ cards }: { cards: PreGameCard[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (cards.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % cards.length);
    }, SLIDE_MS);
    return () => clearInterval(id);
  }, [cards.length]);

  // Empty state: session live but no history to narrate yet.
  if (cards.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white">
        <p className="animate-pulse text-7xl">🃏</p>
        <p className="mt-8 text-4xl font-black text-emerald-400">La mesa está lista</p>
        <p className="mt-3 text-xl text-gray-500">Esperando la primera mano...</p>
      </div>
    );
  }

  const card = cards[index];

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-black px-8 text-white">
      {/* Little "preview" ribbon */}
      <div className="absolute top-10 flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="text-sm font-black uppercase tracking-[0.3em] text-gray-500">
          Previa de la noche
        </span>
      </div>

      {/* Card */}
      <div
        key={card.id}
        className={`animate-fade-in flex max-w-4xl flex-col items-center rounded-3xl bg-gray-950/60 p-14 text-center ${ACCENT_GLOW[card.accent]}`}
      >
        <span className="text-8xl">{card.emoji}</span>
        <h2 className={`mt-8 text-5xl font-black leading-tight ${ACCENT_TEXT[card.accent]}`}>
          {card.headline}
        </h2>
        <p className="mt-6 max-w-2xl text-2xl font-medium text-gray-300">
          {card.subtitle}
        </p>
      </div>

      {/* Progress dots */}
      {cards.length > 1 && (
        <div className="absolute bottom-10 flex gap-2">
          {cards.map((c, i) => (
            <div
              key={c.id}
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
