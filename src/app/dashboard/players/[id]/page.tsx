import { getPlayerProfile } from "@/lib/player-profile";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getPlayerProfile(id);

  if (!profile) notFound();

  const displayName = profile.nickname || profile.name;
  const dangerFires = "🔥".repeat(profile.dangerLevel) + "▪️".repeat(5 - profile.dangerLevel);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-gray-950 px-4 py-8 text-gray-100">
      {/* Back */}
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">
        ← Dashboard
      </Link>

      {/* Header: Style + Name + Danger */}
      <div className="mt-4 mb-8 text-center">
        <p className="text-6xl mb-2">{profile.style.emoji}</p>
        <h1 className="text-3xl font-black">{displayName}</h1>
        <p className="mt-1 text-lg text-gray-400">{profile.style.name}</p>
        <p className="text-sm text-gray-500">{profile.style.description}</p>
        <p className="mt-2 text-lg tracking-wider">{dangerFires}</p>
      </div>

      {/* Relations */}
      {(profile.favoriteVictim || profile.nemesis || profile.kryptonite) && (
        <section className="mb-6 rounded-xl bg-gray-900 p-4 space-y-3">
          {profile.favoriteVictim && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">🎯 Víctima favorita</span>
              <div className="text-right">
                <span className="font-medium">{profile.favoriteVictim.nickname || profile.favoriteVictim.name}</span>
                <p className="text-xs text-gray-500">{profile.favoriteVictim.detail}</p>
              </div>
            </div>
          )}
          {profile.nemesis && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">😈 Némesis</span>
              <div className="text-right">
                <span className="font-medium">{profile.nemesis.nickname || profile.nemesis.name}</span>
                <p className="text-xs text-gray-500">{profile.nemesis.detail}</p>
              </div>
            </div>
          )}
          {profile.kryptonite && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">🧿 Kryptonita</span>
              <div className="text-right">
                <span className="font-medium">{profile.kryptonite.nickname || profile.kryptonite.name}</span>
                <p className="text-xs text-gray-500">{profile.kryptonite.detail}</p>
              </div>
            </div>
          )}
          {profile.revivedBy && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">🧟 Revivido por</span>
              <div className="text-right">
                <span className="font-medium">{profile.revivedBy.nickname || profile.revivedBy.name}</span>
                <p className="text-xs text-gray-500">{profile.revivedBy.detail}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Session Stats */}
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Sesiones</h2>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Jugadas" value={profile.sessionsPlayed} />
          <StatCard label="Victorias" value={profile.wins} />
          <StatCard label="Podios" value={profile.podiums} />
          <StatCard label="Promedio" value={profile.avgPosition} suffix="º" />
          <StatCard label="Mejor" value={profile.bestPosition} suffix="º" />
          <StatCard label="Peor" value={profile.worstPosition} suffix="º" />
        </div>
      </section>

      {/* Hand Stats */}
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Manos</h2>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Jugadas" value={profile.handsPlayed} />
          <StatCard label="Ganadas" value={profile.handsWon} />
          <StatCard label="Win Rate" value={profile.handWinRate} suffix="%" />
          <StatCard label="Fold Rate" value={profile.foldRate} suffix="%" />
          <StatCard label="All-Ins" value={profile.allIns} />
          <StatCard label="A-I Won" value={profile.allInsWon} />
          <StatCard label="Survival" value={profile.allInSurvivalRate} suffix="%" />
          <StatCard label="Kills" value={profile.kills} />
          <StatCard label="Clutch" value={profile.clutchFactor} suffix="%" />
        </div>
      </section>

      {/* Position Role Stats */}
      {(profile.dealerHands > 0 || profile.sbHands > 0) && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Por Posición</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-gray-900 p-3 text-center">
              <p className="text-xs text-yellow-500">Dealer (BB)</p>
              <p className="text-xl font-bold">{profile.dealerWinRate}%</p>
              <p className="text-xs text-gray-500">{profile.dealerHands} manos</p>
            </div>
            <div className="rounded-lg bg-gray-900 p-3 text-center">
              <p className="text-xs text-blue-400">Small Blind</p>
              <p className="text-xl font-bold">{profile.sbWinRate}%</p>
              <p className="text-xs text-gray-500">{profile.sbHands} manos</p>
            </div>
          </div>
        </section>
      )}

      {/* Fun Stats */}
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Highlights</h2>
        <div className="space-y-2">
          {/* Streak */}
          <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-3">
            <span className="text-sm text-gray-400">
              {profile.currentStreak.type === "win" ? "🔥 Racha actual" : "🏜️ Sequía"}
            </span>
            <span className="font-bold">
              {profile.currentStreak.count} sesiones {profile.currentStreak.type === "win" ? "ganando" : "sin ganar"}
            </span>
          </div>

          {/* Comeback */}
          {profile.bestComeback && (
            <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-3">
              <span className="text-sm text-gray-400">🦅 Mejor remontada</span>
              <span className="font-bold">
                {profile.bestComeback.allIns} all-ins → {profile.bestComeback.position}º
              </span>
            </div>
          )}

          {/* Drinks */}
          <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-3">
            <span className="text-sm text-gray-400">🍺 Cervezas</span>
            <span className="font-bold">
              {profile.drinkStats.total} total ({profile.drinkStats.perSession}/sesión)
            </span>
          </div>

          {/* Drunk vs Sober */}
          {profile.drinkStats.total > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-3">
              <span className="text-sm text-gray-400">
                {profile.drinkStats.winRateDrunk > profile.drinkStats.winRateSober ? "🍺 Borracho peligroso" : "🧊 Mejor sobrio"}
              </span>
              <span className="text-xs text-gray-500">
                Sobrio: {profile.drinkStats.winRateSober}% · Con 🍺: {profile.drinkStats.winRateDrunk}%
              </span>
            </div>
          )}

          {/* Revivals */}
          {profile.timesRevived > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-3">
              <span className="text-sm text-gray-400">🧟 Veces revivido</span>
              <span className="font-bold">{profile.timesRevived}</span>
            </div>
          )}
        </div>
      </section>

      {/* Badges */}
      {profile.badges.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {profile.badges.map((badge, i) => (
              <div
                key={i}
                className="rounded-lg bg-gray-900 px-3 py-2 text-center"
                title={badge.detail}
              >
                <p className="text-2xl">{badge.emoji}</p>
                <p className="text-[10px] text-gray-400">{badge.title}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function StatCard({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg bg-gray-900 p-3 text-center">
      <p className="text-lg font-bold">
        {value}{suffix}
      </p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}
