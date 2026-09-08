import { db } from "@/db";
import {
  sessions,
  sessionPlayers,
  players,
  hands,
  handPlayers,
  substitutions,
  HAND_TYPE_LABELS,
} from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlayerStyle = {
  name: string;
  emoji: string;
  description: string;
};

export type PlayerRelation = {
  playerId: string;
  name: string;
  nickname: string | null;
  detail: string;
};

export type PlayerProfile = {
  id: string;
  name: string;
  nickname: string | null;

  // Identity
  style: PlayerStyle;
  dangerLevel: number; // 1-5

  // Relations
  favoriteVictim: PlayerRelation | null;
  nemesis: PlayerRelation | null;
  kryptonite: PlayerRelation | null; // player whose presence tanks their win rate

  // Session stats
  sessionsPlayed: number;
  wins: number;
  podiums: number;
  avgPosition: number;
  bestPosition: number;
  worstPosition: number;

  // Hand stats
  handsPlayed: number;
  handsWon: number;
  handWinRate: number;
  foldRate: number;
  allIns: number;
  allInsWon: number;
  allInSurvivalRate: number;
  kills: number;

  // Position role stats (D/SB)
  dealerWinRate: number;
  dealerHands: number;
  sbWinRate: number;
  sbHands: number;

  // Fun stats
  clutchFactor: number; // win rate in heads-up (2 players alive)
  bestComeback: { allIns: number; position: number } | null; // session with most all-ins survived + good finish
  drinkStats: { total: number; perSession: number; winRateSober: number; winRateDrunk: number };
  currentStreak: { type: "win" | "loss"; count: number };

  // Signature winning hand
  signatureHand: { label: string; emoji: string; count: number } | null;

  // Badges
  badges: { emoji: string; title: string; detail: string }[];

  // Revivals
  timesRevived: number;
  revivedBy: PlayerRelation | null;
};

// ─── Main function ───────────────────────────────────────────────────────────

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  // Get player info
  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) return null;

  // ─── Session data ────────────────────────────────────────────────────────

  const sessionData = await db
    .select({
      sessionId: sessionPlayers.sessionId,
      finishPosition: sessionPlayers.finishPosition,
      playerCount: sessions.playerCount,
    })
    .from(sessionPlayers)
    .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
    .where(eq(sessionPlayers.playerId, playerId));

  const closedSessions = sessionData.filter((s) => s.finishPosition !== null);
  const sessionsPlayed = closedSessions.length;
  const positions = closedSessions.map((s) => s.finishPosition!);
  const wins = positions.filter((p) => p === 1).length;
  const podiums = positions.filter((p) => p <= 3).length;
  const avgPosition = positions.length > 0 ? Math.round((positions.reduce((s, p) => s + p, 0) / positions.length) * 10) / 10 : 0;
  const bestPosition = positions.length > 0 ? Math.min(...positions) : 0;
  const worstPosition = positions.length > 0 ? Math.max(...positions) : 0;

  // ─── Hand data ──────────────────────────────────────────────────────────

  const allHandData = await db
    .select({
      handId: handPlayers.handId,
      playerId: handPlayers.playerId,
      participated: handPlayers.participated,
      won: handPlayers.won,
      wentAllIn: handPlayers.wentAllIn,
      eliminated: handPlayers.eliminated,
      drinks: handPlayers.drinks,
    })
    .from(handPlayers)
    .innerJoin(hands, eq(handPlayers.handId, hands.id));

  const myHands = allHandData.filter((h) => h.playerId === playerId);
  const handsPlayed = myHands.filter((h) => h.participated).length;
  const handsWon = myHands.filter((h) => h.won).length;
  const handWinRate = handsPlayed > 0 ? Math.round((handsWon / handsPlayed) * 100) : 0;
  const totalHandRecords = myHands.length;
  const foldedHands = myHands.filter((h) => !h.participated).length;
  const foldRate = totalHandRecords > 0 ? Math.round((foldedHands / totalHandRecords) * 100) : 0;
  const allIns = myHands.filter((h) => h.wentAllIn).length;
  const allInsWon = myHands.filter((h) => h.wentAllIn && h.won).length;
  const allInsSurvived = myHands.filter((h) => h.wentAllIn && !h.eliminated).length;
  const allInSurvivalRate = allIns > 0 ? Math.round((allInsSurvived / allIns) * 100) : 0;

  // ─── Kills (winner of hand where someone was eliminated) ────────────────

  const handMap = new Map<string, typeof allHandData>();
  for (const hp of allHandData) {
    const arr = handMap.get(hp.handId) || [];
    arr.push(hp);
    handMap.set(hp.handId, arr);
  }

  let kills = 0;
  const killVictims = new Map<string, number>(); // victimId -> count
  const killedBy = new Map<string, number>(); // killerId -> count

  for (const [_, hps] of handMap) {
    const winner = hps.find((h) => h.won);
    const eliminated = hps.filter((h) => h.eliminated);
    if (!winner || eliminated.length === 0) continue;

    if (winner.playerId === playerId) {
      kills += eliminated.length;
      for (const v of eliminated) {
        killVictims.set(v.playerId, (killVictims.get(v.playerId) || 0) + 1);
      }
    }
    for (const v of eliminated) {
      if (v.playerId === playerId) {
        killedBy.set(winner.playerId, (killedBy.get(winner.playerId) || 0) + 1);
      }
    }
  }

  // ─── Favorite victim ────────────────────────────────────────────────────

  let favoriteVictim: PlayerRelation | null = null;
  if (killVictims.size > 0) {
    const [topVictimId, count] = [...killVictims.entries()].sort((a, b) => b[1] - a[1])[0];
    const [victimPlayer] = await db.select().from(players).where(eq(players.id, topVictimId));
    if (victimPlayer) {
      favoriteVictim = {
        playerId: topVictimId,
        name: victimPlayer.name,
        nickname: victimPlayer.nickname,
        detail: `Eliminado ${count} veces`,
      };
    }
  }

  // ─── Nemesis ────────────────────────────────────────────────────────────

  let nemesis: PlayerRelation | null = null;
  if (killedBy.size > 0) {
    const [topKillerId, count] = [...killedBy.entries()].sort((a, b) => b[1] - a[1])[0];
    const [killerPlayer] = await db.select().from(players).where(eq(players.id, topKillerId));
    if (killerPlayer) {
      nemesis = {
        playerId: topKillerId,
        name: killerPlayer.name,
        nickname: killerPlayer.nickname,
        detail: `Te eliminó ${count} veces`,
      };
    }
  }

  // ─── Kryptonite (presence tanks win rate) ───────────────────────────────

  let kryptonite: PlayerRelation | null = null;
  if (sessionsPlayed >= 5) {
    const allPlayers = await db.select({ id: players.id, name: players.name, nickname: players.nickname }).from(players);
    const allSessionPlayers = await db
      .select({ sessionId: sessionPlayers.sessionId, playerId: sessionPlayers.playerId })
      .from(sessionPlayers);

    // Group sessions by who attended
    const sessionAttendees = new Map<string, Set<string>>();
    for (const sp of allSessionPlayers) {
      const set = sessionAttendees.get(sp.sessionId) || new Set();
      set.add(sp.playerId);
      sessionAttendees.set(sp.sessionId, set);
    }

    let biggestDrop = 0;
    let kryptonitePlayer: typeof allPlayers[0] | null = null;

    for (const other of allPlayers) {
      if (other.id === playerId) continue;

      const withOther = closedSessions.filter((s) => sessionAttendees.get(s.sessionId)?.has(other.id));
      const withoutOther = closedSessions.filter((s) => !sessionAttendees.get(s.sessionId)?.has(other.id));

      if (withOther.length < 3 || withoutOther.length < 2) continue;

      const winRateWith = withOther.filter((s) => s.finishPosition === 1).length / withOther.length;
      const winRateWithout = withoutOther.filter((s) => s.finishPosition === 1).length / withoutOther.length;
      const drop = winRateWithout - winRateWith;

      if (drop > biggestDrop) {
        biggestDrop = drop;
        kryptonitePlayer = other;
      }
    }

    if (kryptonitePlayer && biggestDrop > 0.1) {
      kryptonite = {
        playerId: kryptonitePlayer.id,
        name: kryptonitePlayer.name,
        nickname: kryptonitePlayer.nickname,
        detail: `Tu win rate baja ${Math.round(biggestDrop * 100)}% cuando está`,
      };
    }
  }

  // ─── Dealer / SB stats ──────────────────────────────────────────────────

  const handsWithRoles = await db
    .select({ id: hands.id, dealerId: hands.dealerId, sbId: hands.sbId })
    .from(hands);

  const dealerHandIds = handsWithRoles.filter((h) => h.dealerId === playerId).map((h) => h.id);
  const sbHandIds = handsWithRoles.filter((h) => h.sbId === playerId).map((h) => h.id);

  const dealerHands = dealerHandIds.length;
  const dealerWins = myHands.filter((h) => dealerHandIds.includes(h.handId) && h.won).length;
  const dealerWinRate = dealerHands > 0 ? Math.round((dealerWins / dealerHands) * 100) : 0;

  const sbHands = sbHandIds.length;
  const sbWins = myHands.filter((h) => sbHandIds.includes(h.handId) && h.won).length;
  const sbWinRate = sbHands > 0 ? Math.round((sbWins / sbHands) * 100) : 0;

  // ─── Clutch factor (win rate when 2-3 players alive) ────────────────────

  // Approximate: hands in the last 30% of a session tend to be heads-up territory
  // Better: count how many players were alive at each hand
  // For now, use a simpler proxy: hands where this player eventually won the session
  // TODO: refine with actual alive count per hand
  const clutchFactor = sessionsPlayed > 0 ? Math.round((wins / sessionsPlayed) * 100) : 0;

  // ─── Best comeback ──────────────────────────────────────────────────────

  // Session where player went all-in most times but still finished top 3
  let bestComeback: { allIns: number; position: number } | null = null;

  const sessionIds = closedSessions.map((s) => s.sessionId);
  for (const s of closedSessions) {
    if (s.finishPosition! > 3) continue;
    const sessionHandIds = (await db.select({ id: hands.id }).from(hands).where(eq(hands.sessionId, s.sessionId))).map((h) => h.id);
    const sessionAllIns = myHands.filter((h) => sessionHandIds.includes(h.handId) && h.wentAllIn).length;
    if (sessionAllIns >= 2 && (!bestComeback || sessionAllIns > bestComeback.allIns)) {
      bestComeback = { allIns: sessionAllIns, position: s.finishPosition! };
    }
  }

  // ─── Drink stats ────────────────────────────────────────────────────────

  const totalDrinks = myHands.reduce((s, h) => s + h.drinks, 0);
  const drinksPerSession = sessionsPlayed > 0 ? Math.round((totalDrinks / sessionsPlayed) * 10) / 10 : 0;

  // Win rate in hands where they had drinks vs not
  const handsWithDrinks = myHands.filter((h) => h.drinks > 0 && h.participated);
  const handsWithoutDrinks = myHands.filter((h) => h.drinks === 0 && h.participated);
  const winRateDrunk = handsWithDrinks.length > 0 ? Math.round((handsWithDrinks.filter((h) => h.won).length / handsWithDrinks.length) * 100) : 0;
  const winRateSober = handsWithoutDrinks.length > 0 ? Math.round((handsWithoutDrinks.filter((h) => h.won).length / handsWithoutDrinks.length) * 100) : 0;

  // ─── Current streak ─────────────────────────────────────────────────────

  let currentStreak: { type: "win" | "loss"; count: number } = { type: "loss", count: 0 };
  if (positions.length > 0) {
    const lastPos = positions[positions.length - 1];
    if (lastPos === 1) {
      let count = 0;
      for (let i = positions.length - 1; i >= 0; i--) {
        if (positions[i] === 1) count++;
        else break;
      }
      currentStreak = { type: "win", count };
    } else {
      let count = 0;
      for (let i = positions.length - 1; i >= 0; i--) {
        if (positions[i] !== 1) count++;
        else break;
      }
      currentStreak = { type: "loss", count };
    }
  }

  // ─── Revivals ───────────────────────────────────────────────────────────

  const revivals = await db
    .select({
      leftPlayerId: substitutions.leftPlayerId,
    })
    .from(substitutions)
    .where(eq(substitutions.revivedPlayerId, playerId));

  const timesRevived = revivals.length;
  let revivedBy: PlayerRelation | null = null;
  if (timesRevived > 0) {
    // Who revived them most (leftPlayerId = the one who gave chips)
    const reviverCounts = new Map<string, number>();
    for (const r of revivals) {
      reviverCounts.set(r.leftPlayerId, (reviverCounts.get(r.leftPlayerId) || 0) + 1);
    }
    const [topReviverId, count] = [...reviverCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const [reviverPlayer] = await db.select().from(players).where(eq(players.id, topReviverId));
    if (reviverPlayer) {
      revivedBy = {
        playerId: topReviverId,
        name: reviverPlayer.name,
        nickname: reviverPlayer.nickname,
        detail: `Te dio fichas ${count} ${count === 1 ? "vez" : "veces"}`,
      };
    }
  }

  // ─── Signature winning hand ─────────────────────────────────────────────

  const wonHandTypes = await db
    .select({ winningHandType: hands.winningHandType })
    .from(handPlayers)
    .innerJoin(hands, eq(handPlayers.handId, hands.id))
    .where(and(eq(handPlayers.playerId, playerId), eq(handPlayers.won, true)));

  const typeCounts = new Map<string, number>();
  for (const r of wonHandTypes) {
    if (r.winningHandType) typeCounts.set(r.winningHandType, (typeCounts.get(r.winningHandType) || 0) + 1);
  }
  let signatureHand: PlayerProfile["signatureHand"] = null;
  if (typeCounts.size > 0) {
    const [sigType, count] = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    signatureHand = {
      label: HAND_TYPE_LABELS[sigType]?.es || sigType,
      emoji: HAND_TYPE_LABELS[sigType]?.emoji || "🃏",
      count,
    };
  }

  // ─── Style classification ───────────────────────────────────────────────

  const style = classifyStyle(foldRate, allIns, handsPlayed, allInSurvivalRate, handWinRate, kills);

  // ─── Danger level ───────────────────────────────────────────────────────

  const dangerLevel = calculateDanger(handWinRate, kills, allInSurvivalRate, wins, sessionsPlayed);

  // ─── Badges ─────────────────────────────────────────────────────────────

  const badges = generateBadges({
    wins, podiums, sessionsPlayed, kills, allIns, allInSurvivalRate,
    handsWon, foldRate, totalDrinks, timesRevived, currentStreak, bestComeback,
  });

  return {
    id: player.id,
    name: player.name,
    nickname: player.nickname,
    style,
    dangerLevel,
    favoriteVictim,
    nemesis,
    kryptonite,
    sessionsPlayed,
    wins,
    podiums,
    avgPosition,
    bestPosition,
    worstPosition,
    handsPlayed,
    handsWon,
    handWinRate,
    foldRate,
    allIns,
    allInsWon,
    allInSurvivalRate,
    kills,
    dealerWinRate,
    dealerHands,
    sbWinRate,
    sbHands,
    clutchFactor,
    bestComeback,
    drinkStats: { total: totalDrinks, perSession: drinksPerSession, winRateSober, winRateDrunk },
    currentStreak,
    signatureHand,
    badges,
    timesRevived,
    revivedBy,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyStyle(
  foldRate: number, allIns: number, handsPlayed: number,
  allInSurvival: number, winRate: number, kills: number
): PlayerStyle {
  const allInRate = handsPlayed > 0 ? (allIns / handsPlayed) * 100 : 0;

  if (allInRate > 20 && foldRate < 15) {
    return { name: "Maniaco", emoji: "🤪", description: "Va a todo, nunca se baja" };
  }
  if (foldRate > 40 && allInRate < 8) {
    return { name: "Roca", emoji: "🪨", description: "Solo juega premium, imposible de leer" };
  }
  if (winRate > 20 && allInRate < 12 && kills >= 5) {
    return { name: "Tiburón", emoji: "🦈", description: "Eficiente y letal" };
  }
  if (allInRate > 15 && allInSurvival < 50) {
    return { name: "Kamikaze", emoji: "💣", description: "Vive al límite, muere joven" };
  }
  if (foldRate > 30 && handsPlayed < 50) {
    return { name: "Fantasma", emoji: "👻", description: "Apenas se nota en la mesa" };
  }
  if (kills >= 8 && winRate > 15) {
    return { name: "Bulldozer", emoji: "🚜", description: "Aplasta a todos a su paso" };
  }
  if (allInSurvival > 75 && allIns >= 10) {
    return { name: "Sobreviviente", emoji: "🐊", description: "Inmortal — no lo puedes matar" };
  }
  if (winRate > 15 && foldRate > 20 && foldRate < 40) {
    return { name: "Calculador", emoji: "🧠", description: "Sabe cuándo entrar y cuándo salir" };
  }
  return { name: "Versátil", emoji: "🎭", description: "Sin patrón claro — impredecible" };
}

function calculateDanger(
  winRate: number, kills: number, allInSurvival: number,
  wins: number, sessions: number
): number {
  let score = 0;
  if (winRate > 20) score += 2;
  else if (winRate > 15) score += 1;
  if (kills > 10) score += 2;
  else if (kills > 5) score += 1;
  if (allInSurvival > 70) score += 1;
  if (sessions > 0 && (wins / sessions) > 0.3) score += 1;
  return Math.min(5, Math.max(1, score));
}

function generateBadges(stats: {
  wins: number; podiums: number; sessionsPlayed: number; kills: number;
  allIns: number; allInSurvivalRate: number; handsWon: number; foldRate: number;
  totalDrinks: number; timesRevived: number;
  currentStreak: { type: string; count: number };
  bestComeback: { allIns: number; position: number } | null;
}): { emoji: string; title: string; detail: string }[] {
  const badges: { emoji: string; title: string; detail: string }[] = [];

  if (stats.wins >= 5) badges.push({ emoji: "👑", title: "Pentacampeón", detail: `${stats.wins} victorias` });
  else if (stats.wins >= 3) badges.push({ emoji: "🏆", title: "Tricampeón", detail: `${stats.wins} victorias` });
  else if (stats.wins >= 1) badges.push({ emoji: "⭐", title: "Campeón", detail: `${stats.wins} victoria${stats.wins > 1 ? "s" : ""}` });

  if (stats.podiums >= 10) badges.push({ emoji: "🥉", title: "Podio de Oro", detail: `${stats.podiums} podios` });

  if (stats.kills >= 15) badges.push({ emoji: "💀", title: "Serial Killer", detail: `${stats.kills} eliminaciones` });
  else if (stats.kills >= 8) badges.push({ emoji: "🗡️", title: "Asesino", detail: `${stats.kills} eliminaciones` });

  if (stats.allIns >= 30) badges.push({ emoji: "🤠", title: "All-In Addict", detail: `${stats.allIns} all-ins` });

  if (stats.allInSurvivalRate >= 80 && stats.allIns >= 10) badges.push({ emoji: "🛡️", title: "Blindado", detail: `${stats.allInSurvivalRate}% survival` });

  if (stats.handsWon >= 50) badges.push({ emoji: "🖐️", title: "Manos de Oro", detail: `${stats.handsWon} manos ganadas` });

  if (stats.foldRate >= 40) badges.push({ emoji: "🪨", title: "Tight Player", detail: `${stats.foldRate}% fold rate` });

  if (stats.totalDrinks >= 30) badges.push({ emoji: "🍺", title: "Hígado de Acero", detail: `${stats.totalDrinks} cervezas` });

  if (stats.timesRevived >= 2) badges.push({ emoji: "🧟", title: "El Zombie", detail: `Revivido ${stats.timesRevived} veces` });

  if (stats.currentStreak.type === "win" && stats.currentStreak.count >= 3) {
    badges.push({ emoji: "🔥", title: "En Llamas", detail: `${stats.currentStreak.count} wins seguidos` });
  }

  if (stats.bestComeback && stats.bestComeback.allIns >= 3) {
    badges.push({ emoji: "🦅", title: "Comeback King", detail: `${stats.bestComeback.allIns} all-ins → ${stats.bestComeback.position}º` });
  }

  if (stats.sessionsPlayed >= 15) badges.push({ emoji: "🎖️", title: "Veterano", detail: `${stats.sessionsPlayed} sesiones` });

  return badges;
}
