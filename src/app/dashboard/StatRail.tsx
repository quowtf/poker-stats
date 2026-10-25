import Link from "next/link";

// Trend/variance-based stats (volatility, consistency) need several sessions
// before they mean anything. Below this threshold we hide them.
export const MIN_SESSIONS_FOR_TRENDS = 5;

// Left nav rail (desktop): icons only, no labels.
export const STAT_LINKS: { id: string; emoji: string; title: string }[] = [
  { id: "points", emoji: "🏆", title: "Puntos" },
  { id: "points-per-session", emoji: "📈", title: "Eficiencia" },
  { id: "wins", emoji: "👑", title: "Victorias" },
  { id: "podiums", emoji: "🥉", title: "Podios" },
  { id: "volatility", emoji: "🎰", title: "Volatilidad" },
  { id: "consistency", emoji: "🧘", title: "Consistencia" },
  { id: "win-rate", emoji: "🎯", title: "Win Rate" },
  { id: "all-ins", emoji: "🤠", title: "All-Ins" },
  { id: "all-in-survival", emoji: "🐊", title: "Survival" },
  { id: "kills", emoji: "🗡️", title: "Kills" },
  { id: "drinks", emoji: "🍺", title: "Cervezas" },
  { id: "fold-rate", emoji: "🪑", title: "Fold Rate" },
];

export function visibleStatLinks(totalSessions: number) {
  return STAT_LINKS.filter(
    (s) =>
      totalSessions >= MIN_SESSIONS_FOR_TRENDS ||
      (s.id !== "volatility" && s.id !== "consistency")
  );
}

const itemClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-lg transition hover:bg-gray-800";

/**
 * Fixed left navigation rail. Hidden on mobile (the page renders its own
 * bottom nav) and sticky on desktop.
 */
export default function StatRail({ totalSessions }: { totalSessions?: number }) {
  const links = visibleStatLinks(totalSessions ?? Infinity);
  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-16 lg:shrink-0 lg:flex-col lg:items-center lg:gap-1.5 lg:overflow-y-auto lg:border-r lg:border-gray-800 lg:bg-gray-900/40 lg:py-6">
      <Link
        href="/dashboard"
        title="Dashboard"
        aria-label="Dashboard"
        className={itemClass}
      >
        🏠
      </Link>
      <span className="my-1 h-px w-8 shrink-0 bg-gray-800" />
      {links.map((stat) => (
        <Link
          key={stat.id}
          href={`/dashboard/stats/${stat.id}`}
          title={stat.title}
          aria-label={stat.title}
          className={itemClass}
        >
          {stat.emoji}
        </Link>
      ))}
    </aside>
  );
}
