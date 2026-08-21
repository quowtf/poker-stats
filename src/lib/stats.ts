import { db } from "@/db";
import { sessions, sessionPlayers, players, hands, handPlayers } from "@/db/schema";
import { desc, eq, sql, count } from "drizzle-orm";

// Points system: 1st=10, 2nd=7, 3rd=5, 4th=3, 5th=2, 6th+=1
function positionPoints(position: number): number {
  switch (position) {
    case 1: return 10;
    case 2: return 7;
    case 3: return 5;
    case 4: return 3;
    case 5: return 2;
    default: return 1;
  }
}

export type LeaderboardEntry = {
  playerId: string;
  name: string;
  nickname: string | null;
  sessionsPlayed: number;
  wins: number;
  podiums: number;
  totalPoints: number;
  pointsPerSession: number;
  averageFinish: number;
};

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const allResults = await db
    .select({
      playerId: sessionPlayers.playerId,
      playerName: players.name,
      playerNickname: players.nickname,
      finishPosition: sessionPlayers.finishPosition,
    })
    .from(sessionPlayers)
    .innerJoin(players, eq(sessionPlayers.playerId, players.id));

  // Aggregate per player
  const statsMap = new Map<
    string,
    {
      name: string;
      nickname: string | null;
      positions: number[];
    }
  >();

  for (const row of allResults) {
    if (row.finishPosition === null) continue; // skip sessions not yet closed
    const existing = statsMap.get(row.playerId);
    if (existing) {
      existing.positions.push(row.finishPosition);
    } else {
      statsMap.set(row.playerId, {
        name: row.playerName,
        nickname: row.playerNickname,
        positions: [row.finishPosition],
      });
    }
  }

  const leaderboard: LeaderboardEntry[] = [];

  for (const [playerId, data] of statsMap) {
    const sessionsPlayed = data.positions.length;
    const wins = data.positions.filter((p) => p === 1).length;
    const podiums = data.positions.filter((p) => p <= 3).length;
    const totalPoints = data.positions.reduce(
      (sum, p) => sum + positionPoints(p),
      0
    );
    const averageFinish =
      data.positions.reduce((sum, p) => sum + p, 0) / sessionsPlayed;

    leaderboard.push({
      playerId,
      name: data.name,
      nickname: data.nickname,
      sessionsPlayed,
      wins,
      podiums,
      totalPoints,
      pointsPerSession: Math.round((totalPoints / sessionsPlayed) * 10) / 10,
      averageFinish: Math.round(averageFinish * 10) / 10,
    });
  }

  // Sort by total points desc, then points per session desc
  leaderboard.sort((a, b) => b.totalPoints - a.totalPoints || b.pointsPerSession - a.pointsPerSession);

  return leaderboard;
}

export type LastSessionResult = {
  id: string;
  playedAt: string;
  playerCount: number;
  players: {
    name: string;
    nickname: string | null;
    finishPosition: number | null;
  }[];
} | null;

export async function getLastSession(): Promise<LastSessionResult> {
  const [lastSession] = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.playedAt), desc(sessions.createdAt))
    .limit(1);

  if (!lastSession) return null;

  const sessionPlayersList = await db
    .select({
      name: players.name,
      nickname: players.nickname,
      finishPosition: sessionPlayers.finishPosition,
    })
    .from(sessionPlayers)
    .innerJoin(players, eq(sessionPlayers.playerId, players.id))
    .where(eq(sessionPlayers.sessionId, lastSession.id))
    .orderBy(sessionPlayers.finishPosition);

  return {
    id: lastSession.id,
    playedAt: lastSession.playedAt,
    playerCount: lastSession.playerCount,
    players: sessionPlayersList,
  };
}

export async function getTotalSessions(): Promise<number> {
  const [result] = await db.select({ total: count() }).from(sessions);
  return result.total;
}

// ─── Advanced Stats (Fase 4) ─────────────────────────────────────────────────

export type PlayerAdvancedStats = {
  playerId: string;
  name: string;
  nickname: string | null;
  // Volatility (std deviation of positions)
  volatility: number;
  // Expected position (avg table size / 2 + 0.5) vs actual avg
  expectedPosition: number;
  positionDelta: number; // negative = better than expected
  // Streaks
  currentWinStreak: number;
  bestWinStreak: number;
  currentDryStreak: number; // sessions without winning
  worstDryStreak: number;
  // Position distribution
  timesFirst: number;
  timesSecond: number;
  timesThird: number;
  timesLast: number;
  // Heads-up (top 2) survival
  timesHeadsUp: number;
  headsUpRate: number; // % of sessions where player reached top 2
  // Drinks
  totalDrinks: number;
  drinksPerSession: number;
};

export type Rivalry = {
  playerA: { id: string; name: string; nickname: string | null };
  playerB: { id: string; name: string; nickname: string | null };
  sharedSessions: number;
  aWinsOverB: number; // times A finishes above B
  bWinsOverA: number;
  closeness: number; // 0-1, how close the rivalry is (0.5 = perfectly even)
};

export type FunLabel = {
  emoji: string;
  title: string;
  player: string;
  description: string;
};

type SessionRow = {
  sessionId: string;
  playerId: string;
  playerName: string;
  playerNickname: string | null;
  finishPosition: number | null;
  playerCount: number;
  playedAt: string;
};

async function getAllSessionData(): Promise<SessionRow[]> {
  return db
    .select({
      sessionId: sessionPlayers.sessionId,
      playerId: sessionPlayers.playerId,
      playerName: players.name,
      playerNickname: players.nickname,
      finishPosition: sessionPlayers.finishPosition,
      playerCount: sessions.playerCount,
      playedAt: sessions.playedAt,
    })
    .from(sessionPlayers)
    .innerJoin(players, eq(sessionPlayers.playerId, players.id))
    .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id));
}

export async function getAdvancedStats(): Promise<PlayerAdvancedStats[]> {
  const rows = await getAllSessionData();

  // Get drinks from hand_players
  const drinkRows = await db
    .select({
      playerId: handPlayers.playerId,
      drinks: handPlayers.drinks,
    })
    .from(handPlayers);

  const playerDrinksMap = new Map<string, number>();
  for (const row of drinkRows) {
    playerDrinksMap.set(row.playerId, (playerDrinksMap.get(row.playerId) || 0) + row.drinks);
  }

  // Group by player, ordered by session date
  const playerData = new Map<
    string,
    {
      name: string;
      nickname: string | null;
      results: { position: number; tableSize: number; date: string }[];
    }
  >();

  for (const row of rows) {
    if (row.finishPosition === null) continue; // skip unclosed sessions
    const existing = playerData.get(row.playerId);
    const entry = {
      position: row.finishPosition,
      tableSize: row.playerCount,
      date: row.playedAt,
    };
    if (existing) {
      existing.results.push(entry);
    } else {
      playerData.set(row.playerId, {
        name: row.playerName,
        nickname: row.playerNickname,
        results: [entry],
      });
    }
  }

  const stats: PlayerAdvancedStats[] = [];

  for (const [playerId, data] of playerData) {
    // Sort by date
    data.results.sort((a, b) => a.date.localeCompare(b.date));

    const positions = data.results.map((r) => r.position);
    const n = positions.length;

    // Volatility (standard deviation)
    const avg = positions.reduce((s, p) => s + p, 0) / n;
    const variance = positions.reduce((s, p) => s + (p - avg) ** 2, 0) / n;
    const volatility = Math.round(Math.sqrt(variance) * 100) / 100;

    // Expected position (for each session, expected = (tableSize + 1) / 2)
    const expectedPositions = data.results.map((r) => (r.tableSize + 1) / 2);
    const avgExpected = expectedPositions.reduce((s, e) => s + e, 0) / n;
    const positionDelta = Math.round((avg - avgExpected) * 100) / 100;

    // Streaks
    let currentWinStreak = 0;
    let bestWinStreak = 0;
    let tempWinStreak = 0;
    let currentDryStreak = 0;
    let worstDryStreak = 0;
    let tempDryStreak = 0;

    for (const pos of positions) {
      if (pos === 1) {
        tempWinStreak++;
        bestWinStreak = Math.max(bestWinStreak, tempWinStreak);
        tempDryStreak = 0;
      } else {
        tempWinStreak = 0;
        tempDryStreak++;
        worstDryStreak = Math.max(worstDryStreak, tempDryStreak);
      }
    }
    // Current streaks (from end)
    for (let i = positions.length - 1; i >= 0; i--) {
      if (positions[i] === 1) currentWinStreak++;
      else break;
    }
    for (let i = positions.length - 1; i >= 0; i--) {
      if (positions[i] !== 1) currentDryStreak++;
      else break;
    }

    // Position distribution
    const timesFirst = positions.filter((p) => p === 1).length;
    const timesSecond = positions.filter((p) => p === 2).length;
    const timesThird = positions.filter((p) => p === 3).length;
    const timesLast = data.results.filter((r) => r.position === r.tableSize).length;

    // Drinks (from hand_players)
    const totalDrinks = playerDrinksMap.get(playerId) || 0;
    const drinksPerSession = n > 0 ? Math.round((totalDrinks / n) * 10) / 10 : 0;

    // Heads-up survival (top 2)
    const timesHeadsUp = positions.filter((p) => p <= 2).length;
    const headsUpRate = Math.round((timesHeadsUp / n) * 100);

    stats.push({
      playerId,
      name: data.name,
      nickname: data.nickname,
      volatility,
      expectedPosition: Math.round(avgExpected * 10) / 10,
      positionDelta,
      currentWinStreak,
      bestWinStreak,
      currentDryStreak,
      worstDryStreak,
      timesFirst,
      timesSecond,
      timesThird,
      timesLast,
      timesHeadsUp,
      headsUpRate,
      totalDrinks,
      drinksPerSession,
    });
  }

  return stats;
}

export async function getRivalries(): Promise<Rivalry[]> {
  const rows = await getAllSessionData();

  // Group by session
  const sessionMap = new Map<string, { playerId: string; name: string; nickname: string | null; position: number }[]>();
  for (const row of rows) {
    if (row.finishPosition === null) continue; // skip unclosed sessions
    const existing = sessionMap.get(row.sessionId) || [];
    existing.push({
      playerId: row.playerId,
      name: row.playerName,
      nickname: row.playerNickname,
      position: row.finishPosition!,
    });
    sessionMap.set(row.sessionId, existing);
  }

  // For every pair, count head-to-head
  const pairStats = new Map<string, { aId: string; aName: string; aNick: string | null; bId: string; bName: string; bNick: string | null; shared: number; aWins: number; bWins: number }>();

  for (const sessionPlayers of sessionMap.values()) {
    for (let i = 0; i < sessionPlayers.length; i++) {
      for (let j = i + 1; j < sessionPlayers.length; j++) {
        const a = sessionPlayers[i];
        const b = sessionPlayers[j];
        // Consistent key ordering
        const [first, second] = a.playerId < b.playerId ? [a, b] : [b, a];
        const key = `${first.playerId}:${second.playerId}`;

        const existing = pairStats.get(key) || {
          aId: first.playerId, aName: first.name, aNick: first.nickname,
          bId: second.playerId, bName: second.name, bNick: second.nickname,
          shared: 0, aWins: 0, bWins: 0,
        };
        existing.shared++;
        if (first.position < second.position) existing.aWins++;
        else existing.bWins++;
        pairStats.set(key, existing);
      }
    }
  }

  // Convert to rivalries, filter for min 5 shared sessions
  const rivalries: Rivalry[] = [];
  for (const pair of pairStats.values()) {
    if (pair.shared < 5) continue;

    const total = pair.aWins + pair.bWins;
    const ratio = pair.aWins / total;
    const closeness = 1 - Math.abs(ratio - 0.5) * 2; // 1 = perfectly even, 0 = total domination

    rivalries.push({
      playerA: { id: pair.aId, name: pair.aName, nickname: pair.aNick },
      playerB: { id: pair.bId, name: pair.bName, nickname: pair.bNick },
      sharedSessions: pair.shared,
      aWinsOverB: pair.aWins,
      bWinsOverA: pair.bWins,
      closeness,
    });
  }

  // Sort by closeness desc (most even rivalries first)
  rivalries.sort((a, b) => b.closeness - a.closeness);

  return rivalries;
}

export async function getFunLabels(): Promise<FunLabel[]> {
  const [stats, rivalries] = await Promise.all([
    getAdvancedStats(),
    getRivalries(),
  ]);

  const labels: FunLabel[] = [];

  if (stats.length === 0) return labels;

  // 🧘 Most consistent (lowest volatility, min 5 sessions)
  const consistent = [...stats]
    .filter((s) => s.volatility > 0)
    .sort((a, b) => a.volatility - b.volatility)[0];
  if (consistent) {
    labels.push({
      emoji: "🧘",
      title: "El Consistente",
      player: consistent.nickname || consistent.name,
      description: `Volatilidad ${consistent.volatility} — siempre termina cerca del mismo lugar`,
    });
  }

  // 🎰 Most volatile (highest volatility)
  const casino = [...stats].sort((a, b) => b.volatility - a.volatility)[0];
  if (casino) {
    labels.push({
      emoji: "🎰",
      title: "El Casino",
      player: casino.nickname || casino.name,
      description: `Volatilidad ${casino.volatility} — o gana todo o se hunde`,
    });
  }

  // 🥈 Eterno Segundo (most 2nd places)
  const eternoSegundo = [...stats].sort((a, b) => b.timesSecond - a.timesSecond)[0];
  if (eternoSegundo && eternoSegundo.timesSecond > 0) {
    labels.push({
      emoji: "🥈",
      title: "Eterno Segundo",
      player: eternoSegundo.nickname || eternoSegundo.name,
      description: `${eternoSegundo.timesSecond} veces en 2.º lugar`,
    });
  }

  // 💀 First Blood (most last places)
  const firstBlood = [...stats].sort((a, b) => b.timesLast - a.timesLast)[0];
  if (firstBlood && firstBlood.timesLast > 0) {
    labels.push({
      emoji: "💀",
      title: "First Blood",
      player: firstBlood.nickname || firstBlood.name,
      description: `${firstBlood.timesLast} veces último eliminado`,
    });
  }

  // 📈 Overperformer (most negative positionDelta = finishes much better than expected)
  const overperformer = [...stats].sort((a, b) => a.positionDelta - b.positionDelta)[0];
  if (overperformer && overperformer.positionDelta < 0) {
    labels.push({
      emoji: "📈",
      title: "Overperformer",
      player: overperformer.nickname || overperformer.name,
      description: `Termina ${Math.abs(overperformer.positionDelta)} posiciones mejor de lo esperado`,
    });
  }

  // 📉 Underperformer
  const underperformer = [...stats].sort((a, b) => b.positionDelta - a.positionDelta)[0];
  if (underperformer && underperformer.positionDelta > 0) {
    labels.push({
      emoji: "📉",
      title: "Underperformer",
      player: underperformer.nickname || underperformer.name,
      description: `Termina ${underperformer.positionDelta} posiciones peor de lo esperado`,
    });
  }

  // 🔥 On Fire (current win streak > 0)
  const onFire = [...stats].sort((a, b) => b.currentWinStreak - a.currentWinStreak)[0];
  if (onFire && onFire.currentWinStreak > 1) {
    labels.push({
      emoji: "🔥",
      title: "On Fire",
      player: onFire.nickname || onFire.name,
      description: `${onFire.currentWinStreak} victorias consecutivas`,
    });
  }

  // 🏜️ Sequía (worst current dry streak)
  const drought = [...stats].sort((a, b) => b.currentDryStreak - a.currentDryStreak)[0];
  if (drought && drought.currentDryStreak >= 5) {
    labels.push({
      emoji: "🏜️",
      title: "La Sequía",
      player: drought.nickname || drought.name,
      description: `${drought.currentDryStreak} sesiones sin ganar`,
    });
  }

  // 🍺 El Animal (most drinks per session)
  const animal = [...stats].sort((a, b) => b.drinksPerSession - a.drinksPerSession)[0];
  if (animal && animal.totalDrinks > 0) {
    labels.push({
      emoji: "🍺",
      title: "El Animal",
      player: animal.nickname || animal.name,
      description: `${animal.drinksPerSession} 🍺/sesión (${animal.totalDrinks} total)`,
    });
  }

  // 🐊 El Sobreviviente (highest all-in survival from hands, fallback to heads-up rate)
  const handStatsData = await getHandStats();
  const allInSurvivors = handStatsData.filter((s) => s.allInCount >= 3);
  if (allInSurvivors.length > 0) {
    const bestSurvivor = allInSurvivors.sort(
      (a, b) => b.allInSurvivalRate - a.allInSurvivalRate
    )[0];
    labels.push({
      emoji: "🐊",
      title: "El Sobreviviente",
      player: bestSurvivor.nickname || bestSurvivor.name,
      description: `Sobrevive ${bestSurvivor.allInSurvivalRate}% de sus all-ins (${bestSurvivor.allInSurvived}/${bestSurvivor.allInCount})`,
    });
  } else {
    // Fallback: heads-up rate when no hand data
    const survivor = [...stats].sort((a, b) => b.headsUpRate - a.headsUpRate)[0];
    if (survivor && survivor.timesHeadsUp > 0) {
      labels.push({
        emoji: "🐊",
        title: "El Sobreviviente",
        player: survivor.nickname || survivor.name,
        description: `Llega al heads-up ${survivor.headsUpRate}% de las veces`,
      });
    }
  }

  // ⚔️ Rivalry más pareja
  if (rivalries.length > 0) {
    const r = rivalries[0]; // already sorted by closeness
    const aName = r.playerA.nickname || r.playerA.name;
    const bName = r.playerB.nickname || r.playerB.name;
    labels.push({
      emoji: "⚔️",
      title: "Rivalidad",
      player: `${aName} vs ${bName}`,
      description: `${r.aWinsOverB}-${r.bWinsOverA} en ${r.sharedSessions} mesas compartidas`,
    });
  }

  // 🧿 Kryptonita (most one-sided rivalry)
  if (rivalries.length > 0) {
    const onesided = [...rivalries].sort((a, b) => a.closeness - b.closeness)[0];
    if (onesided.closeness < 0.5) {
      const winner = onesided.aWinsOverB > onesided.bWinsOverA ? onesided.playerA : onesided.playerB;
      const loser = onesided.aWinsOverB > onesided.bWinsOverA ? onesided.playerB : onesided.playerA;
      const winCount = Math.max(onesided.aWinsOverB, onesided.bWinsOverA);
      labels.push({
        emoji: "🧿",
        title: "Kryptonita",
        player: `${winner.nickname || winner.name} → ${loser.nickname || loser.name}`,
        description: `Le gana ${winCount} de ${onesided.sharedSessions} veces`,
      });
    }
  }

  return labels;
}

// ─── Hand-level Stats ────────────────────────────────────────────────────────

export type HandStats = {
  playerId: string;
  name: string;
  nickname: string | null;
  handsPlayed: number;        // total hands participated in
  handsWon: number;           // pots taken
  winRate: number;            // % of participated hands won
  allInCount: number;         // times went all-in
  allInWon: number;           // times went all-in AND won
  allInSurvived: number;      // times went all-in AND was NOT eliminated
  allInSurvivalRate: number;  // % survived after all-in
  timesEliminated: number;    // times eliminated across all sessions
  eliminationRate: number;    // % of sessions where got eliminated (vs total hands)
};

type HandRow = {
  handId: string;
  playerId: string;
  playerName: string;
  playerNickname: string | null;
  participated: boolean;
  wentAllIn: boolean;
  won: boolean;
  eliminated: boolean;
};

async function getAllHandData(): Promise<HandRow[]> {
  return db
    .select({
      handId: handPlayers.handId,
      playerId: handPlayers.playerId,
      playerName: players.name,
      playerNickname: players.nickname,
      participated: handPlayers.participated,
      wentAllIn: handPlayers.wentAllIn,
      won: handPlayers.won,
      eliminated: handPlayers.eliminated,
    })
    .from(handPlayers)
    .innerJoin(players, eq(handPlayers.playerId, players.id));
}

export async function getHandStats(): Promise<HandStats[]> {
  const rows = await getAllHandData();

  if (rows.length === 0) return [];

  // Group by player
  const playerData = new Map<
    string,
    {
      name: string;
      nickname: string | null;
      participated: number;
      won: number;
      allInCount: number;
      allInWon: number;
      allInSurvived: number;
      eliminated: number;
    }
  >();

  for (const row of rows) {
    if (!row.participated) continue;

    const existing = playerData.get(row.playerId) || {
      name: row.playerName,
      nickname: row.playerNickname,
      participated: 0,
      won: 0,
      allInCount: 0,
      allInWon: 0,
      allInSurvived: 0,
      eliminated: 0,
    };

    existing.participated++;
    if (row.won) existing.won++;
    if (row.wentAllIn) {
      existing.allInCount++;
      if (row.won) existing.allInWon++;
      if (!row.eliminated) existing.allInSurvived++;
    }
    if (row.eliminated) existing.eliminated++;

    playerData.set(row.playerId, existing);
  }

  const stats: HandStats[] = [];

  for (const [playerId, data] of playerData) {
    stats.push({
      playerId,
      name: data.name,
      nickname: data.nickname,
      handsPlayed: data.participated,
      handsWon: data.won,
      winRate: Math.round((data.won / data.participated) * 100),
      allInCount: data.allInCount,
      allInWon: data.allInWon,
      allInSurvived: data.allInSurvived,
      allInSurvivalRate:
        data.allInCount > 0
          ? Math.round((data.allInSurvived / data.allInCount) * 100)
          : 0,
      timesEliminated: data.eliminated,
      eliminationRate: Math.round((data.eliminated / data.participated) * 100),
    });
  }

  // Sort by win rate desc
  stats.sort((a, b) => b.winRate - a.winRate);

  return stats;
}

export async function getHandFunLabels(): Promise<FunLabel[]> {
  const handStats = await getHandStats();
  const labels: FunLabel[] = [];

  if (handStats.length === 0) return labels;

  // 🐊 El Sobreviviente (highest all-in survival rate, min 3 all-ins)
  const survivors = handStats.filter((s) => s.allInCount >= 3);
  if (survivors.length > 0) {
    const survivor = survivors.sort(
      (a, b) => b.allInSurvivalRate - a.allInSurvivalRate
    )[0];
    labels.push({
      emoji: "🐊",
      title: "El Sobreviviente",
      player: survivor.nickname || survivor.name,
      description: `Sobrevive ${survivor.allInSurvivalRate}% de sus all-ins (${survivor.allInSurvived}/${survivor.allInCount})`,
    });
  }

  // 🎯 El Francotirador (best hand win rate, min 10 hands)
  const snipers = handStats.filter((s) => s.handsPlayed >= 10);
  if (snipers.length > 0) {
    const sniper = snipers.sort((a, b) => b.winRate - a.winRate)[0];
    labels.push({
      emoji: "🎯",
      title: "El Francotirador",
      player: sniper.nickname || sniper.name,
      description: `Gana ${sniper.winRate}% de las manos que juega (${sniper.handsWon}/${sniper.handsPlayed})`,
    });
  }

  // 🤠 El Vaquero (most all-ins total)
  const cowboy = [...handStats].sort((a, b) => b.allInCount - a.allInCount)[0];
  if (cowboy && cowboy.allInCount > 0) {
    labels.push({
      emoji: "🤠",
      title: "El Vaquero",
      player: cowboy.nickname || cowboy.name,
      description: `${cowboy.allInCount} all-ins totales (gana ${cowboy.allInWon})`,
    });
  }

  // 💀 El Kamikaze (most all-ins lost / eliminated after all-in)
  const kamikazes = handStats.filter((s) => s.allInCount >= 3);
  if (kamikazes.length > 0) {
    const kamikaze = kamikazes.sort(
      (a, b) => a.allInSurvivalRate - b.allInSurvivalRate
    )[0];
    if (kamikaze.allInSurvivalRate < 60) {
      labels.push({
        emoji: "💣",
        title: "El Kamikaze",
        player: kamikaze.nickname || kamikaze.name,
        description: `Solo sobrevive ${kamikaze.allInSurvivalRate}% de sus all-ins`,
      });
    }
  }

  // 🏆 Mano Caliente (most hands won total)
  const hotHand = [...handStats].sort((a, b) => b.handsWon - a.handsWon)[0];
  if (hotHand && hotHand.handsWon > 0) {
    labels.push({
      emoji: "🖐️",
      title: "Mano Caliente",
      player: hotHand.nickname || hotHand.name,
      description: `${hotHand.handsWon} manos ganadas en total`,
    });
  }

  return labels;
}

// ─── Kill Stats (inferred: hand winner = eliminator) ─────────────────────────

export type KillRecord = {
  killerId: string;
  killerName: string;
  killerNickname: string | null;
  victimId: string;
  victimName: string;
  victimNickname: string | null;
  count: number; // times killer eliminated victim
};

export type KillStats = {
  // El Asesino de Favoritos — most total eliminations
  topKiller: { name: string; nickname: string | null; kills: number } | null;
  // La Víctima — eliminated most times by the same person
  topVictim: { name: string; nickname: string | null; killerName: string; killerNickname: string | null; times: number } | null;
  // El Villano — eliminated the session winner (1st place) most times
  topVillain: { name: string; nickname: string | null; championsKilled: number } | null;
  // Full kill leaderboard
  killLeaderboard: { name: string; nickname: string | null; kills: number }[];
  // Most one-sided kill relationship
  topRivalryKill: KillRecord | null;
};

export async function getKillStats(): Promise<KillStats> {
  // Get all hands with their players
  const allHands = await db
    .select({ id: hands.id, sessionId: hands.sessionId })
    .from(hands);

  if (allHands.length === 0) {
    return { topKiller: null, topVictim: null, topVillain: null, killLeaderboard: [], topRivalryKill: null };
  }

  const allHPs = await db
    .select({
      handId: handPlayers.handId,
      playerId: handPlayers.playerId,
      playerName: players.name,
      playerNickname: players.nickname,
      won: handPlayers.won,
      eliminated: handPlayers.eliminated,
    })
    .from(handPlayers)
    .innerJoin(players, eq(handPlayers.playerId, players.id));

  // Group by hand
  const handMap = new Map<string, typeof allHPs>();
  for (const hp of allHPs) {
    const existing = handMap.get(hp.handId) || [];
    existing.push(hp);
    handMap.set(hp.handId, existing);
  }

  // Build kill records: for each hand with eliminations, winner = killer
  const killPairs: { killerId: string; killerName: string; killerNickname: string | null; victimId: string; victimName: string; victimNickname: string | null; sessionId: string }[] = [];

  for (const hand of allHands) {
    const hps = handMap.get(hand.id) || [];
    const winner = hps.find((hp) => hp.won);
    const eliminated = hps.filter((hp) => hp.eliminated);

    if (winner && eliminated.length > 0) {
      for (const victim of eliminated) {
        killPairs.push({
          killerId: winner.playerId,
          killerName: winner.playerName,
          killerNickname: winner.playerNickname,
          victimId: victim.playerId,
          victimName: victim.playerName,
          victimNickname: victim.playerNickname,
          sessionId: hand.sessionId,
        });
      }
    }
  }

  if (killPairs.length === 0) {
    return { topKiller: null, topVictim: null, topVillain: null, killLeaderboard: [], topRivalryKill: null };
  }

  // ─── Top Killer (most total eliminations) ──────────────────────────────────

  const killCounts = new Map<string, { name: string; nickname: string | null; kills: number }>();
  for (const kp of killPairs) {
    const existing = killCounts.get(kp.killerId) || { name: kp.killerName, nickname: kp.killerNickname, kills: 0 };
    existing.kills++;
    killCounts.set(kp.killerId, existing);
  }

  const killLeaderboard = [...killCounts.values()].sort((a, b) => b.kills - a.kills);
  const topKiller = killLeaderboard[0] || null;

  // ─── Top Victim (most times eliminated by same person) ─────────────────────

  const pairCounts = new Map<string, KillRecord>();
  for (const kp of killPairs) {
    const key = `${kp.killerId}:${kp.victimId}`;
    const existing = pairCounts.get(key) || {
      killerId: kp.killerId,
      killerName: kp.killerName,
      killerNickname: kp.killerNickname,
      victimId: kp.victimId,
      victimName: kp.victimName,
      victimNickname: kp.victimNickname,
      count: 0,
    };
    existing.count++;
    pairCounts.set(key, existing);
  }

  const sortedPairs = [...pairCounts.values()].sort((a, b) => b.count - a.count);
  const topRivalryKill = sortedPairs[0] || null;

  let topVictim: KillStats["topVictim"] = null;
  if (topRivalryKill && topRivalryKill.count >= 2) {
    topVictim = {
      name: topRivalryKill.victimName,
      nickname: topRivalryKill.victimNickname,
      killerName: topRivalryKill.killerName,
      killerNickname: topRivalryKill.killerNickname,
      times: topRivalryKill.count,
    };
  }

  // ─── Top Villain (eliminated the champion most times) ──────────────────────
  // Champion = player who finished 1st in a session

  // Get session winners
  const sessionWinners = await db
    .select({ sessionId: sessionPlayers.sessionId, playerId: sessionPlayers.playerId })
    .from(sessionPlayers)
    .where(eq(sessionPlayers.finishPosition, 1));

  const sessionWinnerMap = new Map<string, string>(); // sessionId -> winnerId
  for (const sw of sessionWinners) {
    sessionWinnerMap.set(sw.sessionId, sw.playerId);
  }

  // Count: who eliminated a session champion (the eventual winner of that session)
  const villainCounts = new Map<string, { name: string; nickname: string | null; championsKilled: number }>();
  for (const kp of killPairs) {
    const sessionChampion = sessionWinnerMap.get(kp.sessionId);
    // If the victim went on to win the session, that doesn't count.
    // We want: who eliminated the champion BEFORE they could win.
    // Actually — re-thinking: if victim was eliminated, they didn't win.
    // "El Villano" = who has eliminated the player who has the MOST session wins overall.
    // Simpler: who has eliminated players who historically have the most wins.
  }

  // Simpler approach: who has eliminated the player ranked #1 in the leaderboard most times
  const leaderboard = await getLeaderboard();
  const topPlayerId = leaderboard[0]?.playerId;

  let topVillain: KillStats["topVillain"] = null;
  if (topPlayerId) {
    const villainKills = new Map<string, { name: string; nickname: string | null; count: number }>();
    for (const kp of killPairs) {
      if (kp.victimId === topPlayerId) {
        const existing = villainKills.get(kp.killerId) || { name: kp.killerName, nickname: kp.killerNickname, count: 0 };
        existing.count++;
        villainKills.set(kp.killerId, existing);
      }
    }
    const sortedVillains = [...villainKills.values()].sort((a, b) => b.count - a.count);
    if (sortedVillains[0] && sortedVillains[0].count >= 1) {
      topVillain = {
        name: sortedVillains[0].name,
        nickname: sortedVillains[0].nickname,
        championsKilled: sortedVillains[0].count,
      };
    }
  }

  return {
    topKiller,
    topVictim,
    topVillain,
    killLeaderboard,
    topRivalryKill,
  };
}
