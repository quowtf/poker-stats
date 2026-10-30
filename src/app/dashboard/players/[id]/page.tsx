import {
  ARCHETYPE_MIN_HANDS,
  ARCHETYPE_MIN_SESSIONS,
  ARCHETYPE_WINDOW_SESSIONS,
  getPlayerProfile,
} from "@/lib/player-profile";
import InfoTip from "../../InfoTip";
import StatRail from "../../StatRail";
import { normalizePhotoUrl } from "@/lib/photo";
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
  const photo = normalizePhotoUrl(profile.photoUrl);
  const dangerFires = "🔥".repeat(profile.dangerLevel) + "▪️".repeat(5 - profile.dangerLevel);
  const topBadge = profile.badges[0];
  const archetypeTip = `${profile.style.emoji} ${profile.style.name} — ${profile.style.description} ${profile.style.evidence} Sin tracking de fichas: la agresión se mide solo por all-ins.`;

  const relations = [
    profile.favoriteVictim && {
      emoji: "🎯", label: "Víctima favorita", ...profile.favoriteVictim,
    },
    profile.nemesis && {
      emoji: "😈", label: "Némesis", ...profile.nemesis,
    },
    profile.kryptonite && {
      emoji: "🧿", label: "Kryptonita", ...profile.kryptonite,
    },
    profile.revivedBy && {
      emoji: "🧟", label: "Revivido por", ...profile.revivedBy,
    },
  ].filter(Boolean) as {
    emoji: string;
    label: string;
    playerId: string;
    name: string;
    nickname: string | null;
    detail: string;
  }[];

  const highlights = [
    profile.bestComeback && {
      emoji: "🦅",
      label: "Mejor remontada",
      value: `${profile.bestComeback.allIns} all-ins → ${profile.bestComeback.position}º`,
    },
    profile.signatureHand && {
      emoji: profile.signatureHand.emoji,
      label: "Mano insignia",
      value: `${profile.signatureHand.label} (${profile.signatureHand.count})`,
    },
    profile.currentStreak.count >= 2 && {
      emoji: profile.currentStreak.type === "win" ? "🔥" : "🏜️",
      label: profile.currentStreak.type === "win" ? "Racha actual" : "Sequía",
      value: `${profile.currentStreak.count} sesiones ${profile.currentStreak.type === "win" ? "ganando" : "sin ganar"}`,
    },
    {
      emoji: "🍺",
      label: "Cervezas",
      value: `${profile.drinkStats.total} total · ${profile.drinkStats.perSession}/sesión`,
    },
    profile.drinkStats.total > 0 && {
      emoji: profile.drinkStats.winRateDrunk > profile.drinkStats.winRateSober ? "🍺" : "🧊",
      label: profile.drinkStats.winRateDrunk > profile.drinkStats.winRateSober ? "Borracho peligroso" : "Mejor sobrio",
      value: `Sobrio ${profile.drinkStats.winRateSober}% · Con 🍺 ${profile.drinkStats.winRateDrunk}%`,
    },
    profile.timesRevived > 0 && {
      emoji: "🧟",
      label: "Veces revivido",
      value: `${profile.timesRevived}`,
    },
    {
      emoji: "🏅",
      label: "Mejor posición",
      value: `${profile.bestPosition}º`,
    },
  ].filter(Boolean) as { emoji: string; label: string; value: string }[];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#08131e] via-[#060c14] to-gray-950 text-gray-100">
      {/* Mobile: centered narrow column. Desktop (lg+): edge-to-edge with the
          shared left nav rail. */}
      <div className="mx-auto max-w-lg px-4 py-8 md:max-w-2xl lg:mx-0 lg:flex lg:max-w-none lg:items-start lg:px-0 lg:py-0">
        <StatRail />

        <div className="min-w-0 flex-1 lg:px-6 lg:py-4 xl:px-8">
          {/* Back */}
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">
            ← Dashboard
          </Link>

          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)] lg:items-start">

            {/* ─── Shareable player card ───────────────────────────────── */}
            <article className="relative overflow-hidden rounded-2xl border border-amber-500/35 bg-[#0a1622] shadow-[0_0_60px_-24px_rgba(251,191,36,0.55)]">
              {/* Photo */}
              <div className="relative w-full overflow-hidden">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#12283a] to-[#061018] text-[7rem]">
                    {profile.style.emoji}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1622] via-[#0a1622]/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h1 className="font-serif text-4xl font-black tracking-wide text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                    {displayName}
                  </h1>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-400">
                    {profile.style.name}
                    <InfoTip text={archetypeTip} />
                  </p>
                </div>
              </div>

              {/* Headline stats */}
              <div className="grid grid-cols-4 divide-x divide-white/10 border-t border-white/10">
                <CardStat value={profile.wins} label="Victorias" />
                <CardStat value={`${profile.handWinRate}%`} label="Win rate" />
                <CardStat value={profile.handsWon} label="Manos" />
                <CardStat value={`${profile.avgPosition}º`} label="Promedio" />
              </div>

              {/* Signature badge */}
              {topBadge && (
                <div className="mx-4 my-4 flex items-center gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5">
                  <span className="text-2xl leading-none">{topBadge.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">
                      {topBadge.title}
                    </p>
                    <p className="truncate text-[11px] italic text-gray-400">{topBadge.detail}</p>
                  </div>
                </div>
              )}

              {/* Footer: style + danger */}
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                <span className="text-[10px] uppercase tracking-[0.18em] text-gray-500">
                  {profile.style.description}
                  <InfoTip text={`Estilo = arquetipo animal calculado con tus últimas ${ARCHETYPE_WINDOW_SESSIONS} sesiones: manos vistas, all-ins, conversión, supervivencia, kills, puesto y volatilidad. Si ningún patrón domina, sale Camaleón; con menos de ${ARCHETYPE_MIN_HANDS} manos o ${ARCHETYPE_MIN_SESSIONS} sesiones, Polluelo. Sin tracking de fichas: la agresión se mide solo por all-ins. Nivel de peligro (🔥 de 1 a 5) combina win rate, eliminaciones y supervivencia en all-ins.`} />
                </span>
                <span className="shrink-0 text-sm tracking-wider">{dangerFires}</span>
              </div>
            </article>

            {/* ─── Panels ──────────────────────────────────────────────── */}
            <div className="grid gap-6 sm:grid-cols-2">

              <section>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Sesiones</h2>
                <div className="grid grid-cols-3 gap-2">
                  <Metric value={profile.sessionsPlayed} label="Jugadas" />
                  <Metric value={profile.handsPlayed} label="Manos" />
                  <Metric value={profile.allIns} label="All-Ins" />
                  <Metric value={`${profile.allInSurvivalRate}%`} label="Survival" />
                  <Metric value={profile.podiums} label="Podios" />
                  <Metric value={`${profile.worstPosition}º`} label="Peor" />
                </div>
              </section>

              <section>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Manos</h2>
                <div className="grid grid-cols-3 gap-2">
                  <Metric value={profile.handsWon} label="Ganadas" />
                  <Metric value={`${profile.handWinRate}%`} label="Win Rate" />
                  <Metric value={`${profile.foldRate}%`} label="Fold Rate" />
                  <Metric value={profile.allInsWon} label="A-I Won" />
                  <Metric value={profile.kills} label="Kills" />
                  {profile.sessionsPlayed >= 5 ? (
                    <Metric value={`${profile.clutchFactor}%`} label="Clutch" />
                  ) : (
                    <Metric value={`${profile.bestPosition}º`} label="Mejor" />
                  )}
                </div>
              </section>

              {relations.length > 0 && (
                <section>
                  <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Rivalidades
                    <InfoTip text="Víctima favorita: a quién elimina más. Némesis: quién lo elimina más. Kryptonita: el jugador que le arruina la noche — cuando está en la mesa, su win rate se desploma (dominación de uno sobre otro, no rivalidad pareja)." />
                  </h2>
                  <div className="space-y-2">
                    {relations.map((r) => (
                      <Link
                        key={r.label}
                        href={`/dashboard/players/${r.playerId}`}
                        className="flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 transition hover:bg-gray-800"
                      >
                        <span className="text-lg leading-none">{r.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-wide text-gray-500">{r.label}</p>
                          <p className="truncate text-sm font-medium">{r.nickname || r.name}</p>
                          <p className="truncate text-xs text-gray-500">{r.detail}</p>
                        </div>
                        <span className="text-gray-600">›</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {(profile.dealerHands > 0 || profile.sbHands > 0) && (
                <section>
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

              <section className="sm:col-span-2">
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Highlights
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {highlights.map((h) => (
                    <div
                      key={h.label}
                      className="flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3"
                    >
                      <span className="text-lg leading-none">{h.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500">{h.label}</p>
                        <p className="truncate text-sm font-medium">{h.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ─── Badges ────────────────────────────────────────────────── */}
              {profile.badges.length > 0 && (
              <section className="sm:col-span-2">
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Badges
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {profile.badges.map((b, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3"
                    >
                      <span className="text-lg leading-none">{b.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500">{b.title}</p>
                        <p className="truncate text-sm font-medium">{b.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              )}

            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function CardStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="px-2 py-3 text-center">
      <p className="font-serif text-2xl font-black leading-none text-white">{value}</p>
      <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-gray-500">{label}</p>
    </div>
  );
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-lg bg-gray-900 p-3 text-center">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}
