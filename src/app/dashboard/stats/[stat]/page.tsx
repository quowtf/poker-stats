import { getLadder, getAvailableStats } from "@/lib/ladders";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function StatLadderPage({
  params,
}: {
  params: Promise<{ stat: string }>;
}) {
  const { stat } = await params;
  const ladder = await getLadder(stat);

  if (!ladder) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-gray-950 px-4 py-8 text-gray-100">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          ← Dashboard
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-4xl">{ladder.emoji}</span>
          <div>
            <h1 className="text-2xl font-bold">{ladder.title}</h1>
            <p className="text-sm text-gray-400">{ladder.description}</p>
          </div>
        </div>
      </div>

      {/* Ladder */}
      <div className="space-y-2">
        {ladder.entries.map((entry) => (
          <div
            key={entry.playerId}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
              entry.rank <= 3 ? "bg-gray-900" : "bg-gray-900/60"
            }`}
          >
            {/* Rank */}
            <span
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                entry.rank === 1
                  ? "bg-yellow-500 text-black"
                  : entry.rank === 2
                  ? "bg-gray-300 text-black"
                  : entry.rank === 3
                  ? "bg-amber-700 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
            >
              {entry.rank}
            </span>

            {/* Name + detail */}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {entry.nickname || entry.name}
              </p>
              {entry.detail && (
                <p className="text-xs text-gray-500">{entry.detail}</p>
              )}
            </div>

            {/* Value */}
            <span className="text-lg font-bold text-emerald-400">
              {entry.value}
              {ladder.unit && (
                <span className="ml-1 text-xs text-gray-500">
                  {ladder.unit}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {ladder.entries.length === 0 && (
        <p className="rounded-lg bg-gray-900 p-6 text-center text-gray-500">
          No hay datos suficientes para este ranking
        </p>
      )}

      {/* All stats nav */}
      <div className="mt-8 border-t border-gray-800 pt-6">
        <p className="mb-3 text-xs text-gray-500 uppercase tracking-wide">
          Otros rankings
        </p>
        <div className="flex flex-wrap gap-2">
          {getAvailableStats()
            .filter((s) => s.id !== stat)
            .map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/stats/${s.id}`}
                className="rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-400 transition hover:bg-gray-800 hover:text-white"
              >
                {s.emoji} {s.title}
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
