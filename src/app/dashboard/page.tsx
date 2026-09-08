import Link from "next/link";
import {
  getLeaderboard,
  getLastSession,
  getTotalSessions,
  getFunLabels,
  getAdvancedStats,
  getRivalries,
  getHandStats,
  getHandFunLabels,
  getKillStats,
  getHandTypeStats,
  getSessionHistory,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [leaderboard, lastSession, totalSessions, funLabels, advancedStats, rivalries, handStats, handFunLabels, killStats, handTypeStats, sessionHistory] =
    await Promise.all([
      getLeaderboard(),
      getLastSession(),
      getTotalSessions(),
      getFunLabels(),
      getAdvancedStats(),
      getRivalries(),
      getHandStats(),
      getHandFunLabels(),
      getKillStats(),
      getHandTypeStats(),
      getSessionHistory(),
    ]);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-gray-950 px-4 py-8 text-gray-100">
      <h1 className="mb-2 text-center text-3xl font-bold">🃏 Poker League</h1>
      <p className="mb-8 text-center text-sm text-gray-500">
        {totalSessions} {totalSessions === 1 ? "sesión" : "sesiones"} jugadas
      </p>

      {/* Last Session */}
      {lastSession && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Última Mesa
          </h2>
          <p className="mb-4 text-center text-xs text-gray-500">
            {new Date(lastSession.playedAt + "T12:00:00").toLocaleDateString(
              "es-MX",
              { day: "numeric", month: "long", year: "numeric" }
            )}{" "}
            · {lastSession.playerCount} jugadores
          </p>

          <Podium players={lastSession.players} />
        </section>
      )}

      {/* Fun Labels */}
      {funLabels.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Premios de la Mesa
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {funLabels.map((label, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg bg-gray-900 px-4 py-3"
              >
                <span className="text-2xl">{label.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-300">
                    {label.title}
                  </p>
                  <p className="truncate font-semibold text-white">
                    {label.player}
                  </p>
                  <p className="text-xs text-gray-500">{label.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Kill Stats */}
      {killStats.topKiller && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Eliminaciones
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {/* El Asesino */}
            {killStats.topKiller && (
              <div className="flex items-start gap-3 rounded-lg bg-gray-900 px-4 py-3">
                <span className="text-2xl">🗡️</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-300">El Asesino</p>
                  <p className="truncate font-semibold text-white">
                    {killStats.topKiller.nickname || killStats.topKiller.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {killStats.topKiller.kills} eliminaciones totales
                  </p>
                </div>
              </div>
            )}

            {/* La Víctima */}
            {killStats.topVictim && (
              <div className="flex items-start gap-3 rounded-lg bg-gray-900 px-4 py-3">
                <span className="text-2xl">🎯</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-300">La Víctima</p>
                  <p className="truncate font-semibold text-white">
                    {killStats.topVictim.nickname || killStats.topVictim.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    Eliminado {killStats.topVictim.times} veces por {killStats.topVictim.killerNickname || killStats.topVictim.killerName}
                  </p>
                </div>
              </div>
            )}

            {/* El Villano */}
            {killStats.topVillain && (
              <div className="flex items-start gap-3 rounded-lg bg-gray-900 px-4 py-3">
                <span className="text-2xl">😈</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-300">El Villano</p>
                  <p className="truncate font-semibold text-white">
                    {killStats.topVillain.nickname || killStats.topVillain.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    Ha eliminado al campeón {killStats.topVillain.championsKilled} veces
                  </p>
                </div>
              </div>
            )}

            {/* Kill Leaderboard */}
            {killStats.killLeaderboard.length > 1 && (
              <div className="rounded-lg bg-gray-900 px-4 py-3">
                <p className="mb-2 text-sm font-medium text-gray-300">Kills Totales</p>
                <div className="space-y-1">
                  {killStats.killLeaderboard.slice(0, 5).map((k, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">
                        {k.nickname || k.name}
                      </span>
                      <span className="font-bold text-red-400">{k.kills}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Leaderboard
          </h2>
          <div className="rounded-xl bg-gray-900">
            {/* Header */}
            <div className="grid grid-cols-[2rem_1fr_3rem_3rem_3rem_3.5rem] gap-1 border-b border-gray-800 px-4 py-2 text-xs text-gray-500">
              <span>#</span>
              <span>Jugador</span>
              <span className="text-center">W</span>
              <span className="text-center">🥉</span>
              <span className="text-center">Pts</span>
              <span className="text-center">P/S</span>
            </div>
            {/* Rows */}
            {leaderboard.map((entry, i) => (
              <div
                key={entry.playerId}
                className={`grid grid-cols-[2rem_1fr_3rem_3rem_3rem_3.5rem] gap-1 px-4 py-3 ${
                  i < leaderboard.length - 1
                    ? "border-b border-gray-800/50"
                    : ""
                }`}
              >
                <span className="text-sm font-bold text-gray-500">
                  {i + 1}
                </span>
                <Link
                  href={`/dashboard/players/${entry.playerId}`}
                  className="truncate text-sm font-medium hover:text-emerald-400 transition"
                >
                  {entry.nickname || entry.name}
                </Link>
                <span className="text-center text-sm">{entry.wins}</span>
                <span className="text-center text-sm">{entry.podiums}</span>
                <span className="text-center text-sm font-semibold text-emerald-400">
                  {entry.totalPoints}
                </span>
                <span className="text-center text-xs text-gray-400">
                  {entry.pointsPerSession}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-gray-600">
            W=Victorias · 🥉=Podios · Pts=Puntos · P/S=Puntos/Sesión
          </p>
        </section>
      )}

      {/* Rivalries */}
      {rivalries.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Rivalidades
          </h2>
          <div className="space-y-2">
            {rivalries.slice(0, 5).map((r, i) => {
              const aName = r.playerA.nickname || r.playerA.name;
              const bName = r.playerB.nickname || r.playerB.name;
              const total = r.aWinsOverB + r.bWinsOverA;
              const aPct = Math.round((r.aWinsOverB / total) * 100);
              return (
                <div
                  key={i}
                  className="rounded-lg bg-gray-900 px-4 py-3"
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{aName}</span>
                    <span className="text-xs text-gray-500">
                      {r.sharedSessions} mesas
                    </span>
                    <span className="font-medium">{bName}</span>
                  </div>
                  {/* Bar */}
                  <div className="flex h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-emerald-500"
                      style={{ width: `${aPct}%` }}
                    />
                    <div
                      className="bg-red-500"
                      style={{ width: `${100 - aPct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-gray-500">
                    <span>{r.aWinsOverB} victorias</span>
                    <span>{r.bWinsOverA} victorias</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Advanced Stats Table */}
      {advancedStats.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Stats Avanzados
          </h2>
          <div className="space-y-2">
            {advancedStats
              .sort((a, b) => a.positionDelta - b.positionDelta)
              .map((s) => (
                <div
                  key={s.playerId}
                  className="rounded-lg bg-gray-900 px-4 py-3"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {s.nickname || s.name}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        s.positionDelta < 0
                          ? "text-emerald-400"
                          : s.positionDelta > 0
                          ? "text-red-400"
                          : "text-gray-400"
                      }`}
                    >
                      {s.positionDelta > 0 ? "+" : ""}
                      {s.positionDelta} vs expected
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Vol: {s.volatility}</span>
                    <span>🏆{s.timesFirst}</span>
                    <span>🥈{s.timesSecond}</span>
                    <span>💀{s.timesLast}</span>
                    <span>🍺{s.drinksPerSession}/s</span>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Hand Stats */}
      {handFunLabels.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Stats por Mano
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {handFunLabels.map((label, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg bg-gray-900 px-4 py-3"
              >
                <span className="text-2xl">{label.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-300">
                    {label.title}
                  </p>
                  <p className="truncate font-semibold text-white">
                    {label.player}
                  </p>
                  <p className="text-xs text-gray-500">{label.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Hand Stats Table */}
      {handStats.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            All-In Stats
          </h2>
          <div className="space-y-2">
            {handStats
              .filter((s) => s.allInCount > 0)
              .sort((a, b) => b.allInCount - a.allInCount)
              .map((s) => (
                <div
                  key={s.playerId}
                  className="rounded-lg bg-gray-900 px-4 py-3"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {s.nickname || s.name}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        s.allInSurvivalRate >= 70
                          ? "text-emerald-400"
                          : s.allInSurvivalRate >= 50
                          ? "text-yellow-400"
                          : "text-red-400"
                      }`}
                    >
                      {s.allInSurvivalRate}% survival
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>All-ins: {s.allInCount}</span>
                    <span>Ganó: {s.allInWon}</span>
                    <span>Sobrevivió: {s.allInSurvived}</span>
                    <span>Win rate: {s.winRate}%</span>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Winning Hand Types */}
      {handTypeStats.distribution.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Manos Ganadoras
          </h2>

          {/* Highlights */}
          <div className="grid grid-cols-1 gap-2 mb-3">
            {handTypeStats.bestHand && (
              <div className="flex items-start gap-3 rounded-lg bg-gray-900 px-4 py-3">
                <span className="text-2xl">{handTypeStats.bestHand.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-300">Mejor mano histórica</p>
                  <p className="truncate font-semibold text-white">
                    {handTypeStats.bestHand.label} · {handTypeStats.bestHand.playerName}
                  </p>
                </div>
              </div>
            )}
            {handTypeStats.thief && handTypeStats.thief.weakWins > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-gray-900 px-4 py-3">
                <span className="text-2xl">🃏</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-300">El Ladrón</p>
                  <p className="truncate font-semibold text-white">
                    {handTypeStats.thief.nickname || handTypeStats.thief.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {handTypeStats.thief.weakWins} manos ganadas con carta alta o par
                  </p>
                </div>
              </div>
            )}
            {handTypeStats.bigHands && (
              <div className="flex items-start gap-3 rounded-lg bg-gray-900 px-4 py-3">
                <span className="text-2xl">💎</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-300">Manos Grandes</p>
                  <p className="truncate font-semibold text-white">
                    {handTypeStats.bigHands.nickname || handTypeStats.bigHands.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    Fuerza promedio {handTypeStats.bigHands.avgStrength}/10
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Distribution */}
          <div className="rounded-lg bg-gray-900 px-4 py-3">
            <p className="mb-2 text-sm font-medium text-gray-300">Distribución</p>
            <div className="space-y-1">
              {handTypeStats.distribution.map((d) => {
                const max = handTypeStats.distribution[0].count;
                const pct = Math.round((d.count / max) * 100);
                return (
                  <div key={d.type} className="flex items-center gap-2 text-xs">
                    <span className="w-28 text-gray-400">{d.emoji} {d.label}</span>
                    <div className="flex-1 h-3 rounded-full bg-gray-800 overflow-hidden">
                      <div className="h-full bg-emerald-600" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right text-gray-400">{d.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Session History */}
      {sessionHistory.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Historial de Sesiones
          </h2>
          <div className="space-y-2">
            {sessionHistory.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/sessions/${s.id}`}
                className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-3 transition hover:bg-gray-800"
              >
                <div>
                  <p className="text-sm font-medium">
                    {new Date(s.playedAt + "T12:00:00").toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-gray-500">{s.playerCount} jugadores</p>
                </div>
                {s.winner && (
                  <span className="text-sm">
                    🏆 <span className="font-medium">{s.winner}</span>
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* All Rankings */}
      {totalSessions > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Todos los Rankings
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "points", emoji: "🏆", title: "Puntos" },
              { id: "points-per-session", emoji: "📈", title: "Eficiencia" },
              { id: "wins", emoji: "👑", title: "Victorias" },
              { id: "podiums", emoji: "🥉", title: "Podios" },
              { id: "volatility", emoji: "🎰", title: "Volatilidad" },
              { id: "consistency", emoji: "🧘", title: "Consistencia" },
              { id: "hands-won", emoji: "🖐️", title: "Manos" },
              { id: "win-rate", emoji: "🎯", title: "Win Rate" },
              { id: "all-ins", emoji: "🤠", title: "All-Ins" },
              { id: "all-in-survival", emoji: "🐊", title: "Survival" },
              { id: "kills", emoji: "🗡️", title: "Kills" },
              { id: "drinks", emoji: "🍺", title: "Cervezas" },
              { id: "fold-rate", emoji: "🪑", title: "Fold Rate" },
            ].map((stat) => (
              <Link
                key={stat.id}
                href={`/dashboard/stats/${stat.id}`}
                className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-3 text-sm transition hover:bg-gray-800"
              >
                <span className="text-lg">{stat.emoji}</span>
                <span className="text-gray-300">{stat.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {totalSessions === 0 && (
        <div className="rounded-xl bg-gray-900 p-8 text-center">
          <p className="text-lg">🃏</p>
          <p className="mt-2 text-gray-400">
            No hay sesiones registradas todavía.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Podium Component ────────────────────────────────────────────────────────

type PodiumPlayer = {
  playerId: string;
  name: string;
  nickname: string | null;
  finishPosition: number | null;
};

function Podium({ players }: { players: PodiumPlayer[] }) {
  const sorted = [...players].sort(
    (a, b) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99)
  );
  const first = sorted.find((p) => p.finishPosition === 1);
  const second = sorted.find((p) => p.finishPosition === 2);
  const third = sorted.find((p) => p.finishPosition === 3);
  const rest = sorted.filter((p) => (p.finishPosition ?? 99) > 3);

  const Spot = ({
    player,
    emoji,
    emojiSize,
    nameColor,
    pedestalH,
    pedestalBg,
    numColor,
    num,
  }: {
    player: PodiumPlayer;
    emoji: string;
    emojiSize: string;
    nameColor: string;
    pedestalH: string;
    pedestalBg: string;
    numColor: string;
    num: number;
  }) => (
    <div className="flex flex-1 flex-col items-center">
      <span className={`${emojiSize} leading-none`}>{emoji}</span>
      <span
        className={`mt-1 w-full truncate px-1 text-center text-sm font-semibold ${nameColor}`}
        title={player.nickname || player.name}
      >
        {player.nickname || player.name}
      </span>
      <div
        className={`mt-2 flex w-full items-start justify-center rounded-t-lg pt-2 text-2xl font-black ${pedestalH} ${pedestalBg} ${numColor}`}
      >
        {num}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl bg-gradient-to-b from-gray-900 to-gray-950 p-5">
      {/* Podium top 3 */}
      <div className="flex items-end justify-center gap-2">
        {/* 2nd */}
        {second && (
          <Spot
            player={second}
            emoji="😤"
            emojiSize="text-5xl"
            nameColor="text-gray-300"
            pedestalH="h-20"
            pedestalBg="bg-gray-700/50"
            numColor="text-gray-400"
            num={2}
          />
        )}

        {/* 1st */}
        {first && (
          <Spot
            player={first}
            emoji="🏆"
            emojiSize="text-7xl"
            nameColor="text-yellow-300"
            pedestalH="h-32"
            pedestalBg="bg-yellow-600/25"
            numColor="text-yellow-400"
            num={1}
          />
        )}

        {/* 3rd */}
        {third && (
          <Spot
            player={third}
            emoji="🤡"
            emojiSize="text-4xl"
            nameColor="text-gray-400"
            pedestalH="h-14"
            pedestalBg="bg-amber-800/30"
            numColor="text-amber-600"
            num={3}
          />
        )}
      </div>

      {/* Rest — compact horizontal row */}
      {rest.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-800 pt-3">
          {rest.map((p) => (
            <div key={p.playerId} className="flex items-center gap-2 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-gray-500">
                {p.finishPosition}
              </span>
              <span className="text-gray-400">{p.nickname || p.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
