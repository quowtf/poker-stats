import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, sessionPlayers, players } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPlayerRelations, getPlayerSummaries } from "@/lib/player-relations";
import { getRivalries } from "@/lib/stats";

/**
 * GET /api/poker/live/pregame
 *
 * Pre-game show: narrative/predictive insights about the players seated in the
 * current live session, built from their real historical stats. Shown full
 * screen on the live view before the first hand is registered (ronda 0).
 *
 * Returns a list of "cards" (emoji + headline + subtitle) in español.
 */

export type PreGameCard = {
  id: string;
  emoji: string;
  headline: string;
  subtitle: string;
  accent: "emerald" | "amber" | "red" | "cyan" | "yellow";
};

// Minimum closed sessions before a player's history is worth narrating.
const MIN_SESSIONS = 3;

export async function GET() {
  try {
    const [liveSession] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.isLive, true))
      .limit(1);

    if (!liveSession) {
      return NextResponse.json({ isLive: false, cards: [] });
    }

    // Players seated in this session.
    const seated = await db
      .select({
        playerId: sessionPlayers.playerId,
        name: players.name,
        nickname: players.nickname,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(eq(sessionPlayers.sessionId, liveSession.id));

    const seatedIds = new Set(seated.map((s) => s.playerId));
    const seatedIdsList = seated.map((s) => s.playerId);

    // Pull the career summaries + relations in BATCH (a few queries for the
    // whole table) instead of a full PlayerProfile per player (~13 queries
    // each, which blocks the pre-game screen).
    const [summaries, relations, rivalries] = await Promise.all([
      getPlayerSummaries(seatedIdsList),
      getPlayerRelations(seatedIdsList),
      getRivalries(),
    ]);

    const cards: PreGameCard[] = [];
    const nameOf = (p: { name: string; nickname: string | null }) => p.nickname || p.name;

    // Only narrate players with enough history.
    const known = seated
      .map((s) => ({
        ...s,
        summary: summaries.get(s.playerId),
        relations: relations.get(s.playerId),
      }))
      .filter(
        (p) =>
          p.summary !== undefined &&
          p.summary.sessionsPlayed >= MIN_SESSIONS
      );

    // 1) Podium favorite — highest podium rate.
    const podiumFav = [...known]
      .map((p) => ({
        p,
        rate: p.summary!.podiums / p.summary!.sessionsPlayed,
      }))
      .sort((a, b) => b.rate - a.rate)[0];
    if (podiumFav && podiumFav.rate >= 0.4) {
      cards.push({
        id: "podium",
        emoji: "🥉",
        headline: `Se espera que ${nameOf(podiumFav.p)} llegue al podio`,
        subtitle: `Sube al podio el ${Math.round(podiumFav.rate * 100)}% de las noches (${podiumFav.p.summary!.podiums}/${podiumFav.p.summary!.sessionsPlayed})`,
        accent: "amber",
      });
    }

    // 2) Rey del winrate — best hand win rate (needs enough hands).
    const wrKing = [...known]
      .filter((p) => p.summary!.handsPlayed >= 10)
      .sort((a, b) => b.summary!.handWinRate - a.summary!.handWinRate)[0];
    if (wrKing) {
      cards.push({
        id: "winrate",
        emoji: "🎯",
        headline: `¿Hoy cae el rey del winrate?`,
        subtitle: `${nameOf(wrKing)} acumula un ${wrKing.summary!.handWinRate}% de efectividad. ¡Impresionanteee!`,
        accent: "emerald",
      });
    }

    // 3) Rivalry of the night — closest rivalry among seated players.
    const nightRivalry = rivalries.find(
      (r) => seatedIds.has(r.playerA.id) && seatedIds.has(r.playerB.id)
    );
    if (nightRivalry) {
      const a = nightRivalry.playerA.nickname || nightRivalry.playerA.name;
      const b = nightRivalry.playerB.nickname || nightRivalry.playerB.name;
      cards.push({
        id: "rivalry",
        emoji: "⚔️",
        headline: `La rivalidad de la noche: ${a} vs ${b}`,
        subtitle: `${nightRivalry.aWinsOverB}–${nightRivalry.bWinsOverA} en ${nightRivalry.sharedSessions} noches juntos. Parejísimo.`,
        accent: "red",
      });
    }

    // 4) El verdugo — most kills among seated players.
    const executioner = [...known].sort(
      (a, b) => b.summary!.kills - a.summary!.kills
    )[0];
    if (executioner && executioner.summary!.kills >= 3) {
      cards.push({
        id: "executioner",
        emoji: "☠️",
        headline: `El verdugo anda suelto: ${nameOf(executioner)}`,
        subtitle: `Lleva ${executioner.summary!.kills} eliminaciones en su historial. Cuidado con sus fichas.`,
        accent: "yellow",
      });
    }

    // 5) Hot streak — someone riding a current win streak.
    const onFire = [...known]
      .filter(
        (p) =>
          p.relations?.currentStreak.type === "win" &&
          p.relations.currentStreak.count >= 2
      )
      .sort(
        (a, b) =>
          (b.relations?.currentStreak.count ?? 0) -
          (a.relations?.currentStreak.count ?? 0)
      )[0];
    if (onFire?.relations) {
      cards.push({
        id: "streak",
        emoji: "🔥",
        headline: `${nameOf(onFire)} viene en llamas`,
        subtitle: `${onFire.relations.currentStreak.count} victorias seguidas. ¿Alguien lo para esta noche?`,
        accent: "cyan",
      });
    }

    // 6) Kryptonite drama — a seated player's kryptonite is also at the table.
    for (const p of known) {
      const kryptonite = p.relations?.kryptonite;
      if (kryptonite && seatedIds.has(kryptonite.playerId)) {
        cards.push({
          id: `kryptonite-${p.playerId}`,
          emoji: "🧪",
          headline: `${kryptonite.nickname || kryptonite.name} es la kryptonita de ${nameOf(p)}`,
          subtitle: kryptonite.detail,
          accent: "red",
        });
        break; // one is enough
      }
    }

    return NextResponse.json({ isLive: true, cards });
  } catch (error) {
    console.error("Error building pre-game insights:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
