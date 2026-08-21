import { db } from "@/db";
import { sessions, sessionPlayers, players, hands, handPlayers } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export type LadderEntry = {
  rank: number;
  playerId: string;
  name: string;
  nickname: string | null;
  value: number;
  detail?: string;
};

export type LadderResult = {
  statId: string;
  title: string;
  emoji: string;
  description: string;
  unit: string;
  entries: LadderEntry[];
};

// ─── Data fetchers (cached per call) ─────────────────────────────────────────

async function getSessionData() {
  return db
    .select({
      playerId: sessionPlayers.playerId,
      playerName: players.name,
      playerNickname: players.nickname,
      finishPosition: sessionPlayers.finishPosition,
      playerCount: sessions.playerCount,
    })
    .from(sessionPlayers)
    .innerJoin(players, eq(sessionPlayers.playerId, players.id))
    .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id));
}

async function getHandData() {
  return db
    .select({
      playerId: handPlayers.playerId,
      playerName: players.name,
      playerNickname: players.nickname,
      participated: handPlayers.participated,
      won: handPlayers.won,
      wentAllIn: handPlayers.wentAllIn,
      eliminated: handPlayers.eliminated,
      drinks: handPlayers.drinks,
      handId: handPlayers.handId,
    })
    .from(handPlayers)
    .innerJoin(players, eq(handPlayers.playerId, players.id));
}

// ─── Points system ───────────────────────────────────────────────────────────

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

// ─── Ladder generators ───────────────────────────────────────────────────────

const LADDER_GENERATORS: Record<string, () => Promise<LadderResult>> = {
  points: async () => {
    const rows = await getSessionData();
    const map = new Map<string, { name: string; nickname: string | null; points: number; sessions: number }>();
    for (const r of rows) {
      if (r.finishPosition === null) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, points: 0, sessions: 0 };
      e.points += positionPoints(r.finishPosition);
      e.sessions++;
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: d.points, detail: `${d.sessions} sesiones` }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "points", title: "Puntos Totales", emoji: "🏆", description: "Sistema: 1º=10, 2º=7, 3º=5, 4º=3, 5º=2, 6º+=1", unit: "pts", entries };
  },

  "points-per-session": async () => {
    const rows = await getSessionData();
    const map = new Map<string, { name: string; nickname: string | null; points: number; sessions: number }>();
    for (const r of rows) {
      if (r.finishPosition === null) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, points: 0, sessions: 0 };
      e.points += positionPoints(r.finishPosition);
      e.sessions++;
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: Math.round((d.points / d.sessions) * 10) / 10, detail: `${d.points} pts / ${d.sessions} ses` }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "points-per-session", title: "Eficiencia", emoji: "📈", description: "Puntos promedio por sesión", unit: "pts/s", entries };
  },

  wins: async () => {
    const rows = await getSessionData();
    const map = new Map<string, { name: string; nickname: string | null; wins: number; sessions: number }>();
    for (const r of rows) {
      if (r.finishPosition === null) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, wins: 0, sessions: 0 };
      if (r.finishPosition === 1) e.wins++;
      e.sessions++;
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: d.wins, detail: `${Math.round((d.wins / d.sessions) * 100)}% win rate` }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "wins", title: "Victorias", emoji: "👑", description: "Sesiones ganadas (1er lugar)", unit: "", entries };
  },

  podiums: async () => {
    const rows = await getSessionData();
    const map = new Map<string, { name: string; nickname: string | null; podiums: number; sessions: number }>();
    for (const r of rows) {
      if (r.finishPosition === null) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, podiums: 0, sessions: 0 };
      if (r.finishPosition <= 3) e.podiums++;
      e.sessions++;
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: d.podiums, detail: `${Math.round((d.podiums / d.sessions) * 100)}% podio rate` }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "podiums", title: "Podios", emoji: "🥉", description: "Veces en top 3", unit: "", entries };
  },

  volatility: async () => {
    const rows = await getSessionData();
    const map = new Map<string, { name: string; nickname: string | null; positions: number[] }>();
    for (const r of rows) {
      if (r.finishPosition === null) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, positions: [] };
      e.positions.push(r.finishPosition);
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .filter(([_, d]) => d.positions.length >= 3)
      .map(([id, d]) => {
        const avg = d.positions.reduce((s, p) => s + p, 0) / d.positions.length;
        const variance = d.positions.reduce((s, p) => s + (p - avg) ** 2, 0) / d.positions.length;
        const vol = Math.round(Math.sqrt(variance) * 100) / 100;
        return { playerId: id, name: d.name, nickname: d.nickname, value: vol, detail: `Posiciones: ${d.positions.join(", ")}` };
      })
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "volatility", title: "Volatilidad", emoji: "🎰", description: "Desviación estándar de posición (mayor = más impredecible)", unit: "σ", entries };
  },

  consistency: async () => {
    const rows = await getSessionData();
    const map = new Map<string, { name: string; nickname: string | null; positions: number[] }>();
    for (const r of rows) {
      if (r.finishPosition === null) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, positions: [] };
      e.positions.push(r.finishPosition);
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .filter(([_, d]) => d.positions.length >= 3)
      .map(([id, d]) => {
        const avg = d.positions.reduce((s, p) => s + p, 0) / d.positions.length;
        const variance = d.positions.reduce((s, p) => s + (p - avg) ** 2, 0) / d.positions.length;
        const vol = Math.round(Math.sqrt(variance) * 100) / 100;
        return { playerId: id, name: d.name, nickname: d.nickname, value: vol, detail: `Promedio: ${Math.round(avg * 10) / 10}` };
      })
      .sort((a, b) => a.value - b.value) // lower = more consistent
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "consistency", title: "Consistencia", emoji: "🧘", description: "Menor volatilidad = más predecible", unit: "σ", entries };
  },

  "hands-won": async () => {
    const rows = await getHandData();
    const map = new Map<string, { name: string; nickname: string | null; won: number; played: number }>();
    for (const r of rows) {
      if (!r.participated) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, won: 0, played: 0 };
      e.played++;
      if (r.won) e.won++;
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: d.won, detail: `${Math.round((d.won / d.played) * 100)}% win rate (${d.played} jugadas)` }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "hands-won", title: "Manos Ganadas", emoji: "🖐️", description: "Total de manos ganadas históricamente", unit: "", entries };
  },

  "win-rate": async () => {
    const rows = await getHandData();
    const map = new Map<string, { name: string; nickname: string | null; won: number; played: number }>();
    for (const r of rows) {
      if (!r.participated) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, won: 0, played: 0 };
      e.played++;
      if (r.won) e.won++;
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .filter(([_, d]) => d.played >= 10)
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: Math.round((d.won / d.played) * 100), detail: `${d.won}/${d.played} manos` }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "win-rate", title: "Win Rate", emoji: "🎯", description: "Porcentaje de manos ganadas (mín 10 jugadas)", unit: "%", entries };
  },

  "all-ins": async () => {
    const rows = await getHandData();
    const map = new Map<string, { name: string; nickname: string | null; allIns: number; survived: number }>();
    for (const r of rows) {
      if (!r.wentAllIn) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, allIns: 0, survived: 0 };
      e.allIns++;
      if (!r.eliminated) e.survived++;
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: d.allIns, detail: `${Math.round((d.survived / d.allIns) * 100)}% survival` }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "all-ins", title: "All-Ins", emoji: "🤠", description: "Total de veces que fue all-in", unit: "", entries };
  },

  "all-in-survival": async () => {
    const rows = await getHandData();
    const map = new Map<string, { name: string; nickname: string | null; allIns: number; survived: number }>();
    for (const r of rows) {
      if (!r.wentAllIn) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, allIns: 0, survived: 0 };
      e.allIns++;
      if (!r.eliminated) e.survived++;
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .filter(([_, d]) => d.allIns >= 3)
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: Math.round((d.survived / d.allIns) * 100), detail: `${d.survived}/${d.allIns} all-ins` }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "all-in-survival", title: "Supervivencia All-In", emoji: "🐊", description: "Porcentaje de all-ins donde no fue eliminado (mín 3)", unit: "%", entries };
  },

  kills: async () => {
    const allHands = await db.select({ id: hands.id }).from(hands);
    const allHPs = await getHandData();
    const handMap = new Map<string, typeof allHPs>();
    for (const hp of allHPs) {
      const existing = handMap.get(hp.handId) || [];
      existing.push(hp);
      handMap.set(hp.handId, existing);
    }
    const killCounts = new Map<string, { name: string; nickname: string | null; kills: number }>();
    for (const [handId, hps] of handMap) {
      const winner = hps.find((hp) => hp.won);
      const eliminated = hps.filter((hp) => hp.eliminated);
      if (winner && eliminated.length > 0) {
        const e = killCounts.get(winner.playerId) || { name: winner.playerName, nickname: winner.playerNickname, kills: 0 };
        e.kills += eliminated.length;
        killCounts.set(winner.playerId, e);
      }
    }
    const entries = [...killCounts.entries()]
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: d.kills }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "kills", title: "Eliminaciones", emoji: "🗡️", description: "Total de jugadores eliminados", unit: "", entries };
  },

  drinks: async () => {
    const rows = await getHandData();
    const map = new Map<string, { name: string; nickname: string | null; total: number; hands: number }>();
    for (const r of rows) {
      if (r.drinks === 0) continue;
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, total: 0, hands: 0 };
      e.total += r.drinks;
      e.hands++;
      map.set(r.playerId, e);
    }
    // Also include zeros
    for (const r of rows) {
      if (!map.has(r.playerId)) {
        map.set(r.playerId, { name: r.playerName, nickname: r.playerNickname, total: 0, hands: 0 });
      }
    }
    const entries = [...map.entries()]
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: d.total, detail: `${d.hands} manos con 🍺` }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "drinks", title: "Cervezas", emoji: "🍺", description: "Total de cervezas registradas", unit: "🍺", entries };
  },

  "fold-rate": async () => {
    const rows = await getHandData();
    const map = new Map<string, { name: string; nickname: string | null; folded: number; total: number }>();
    for (const r of rows) {
      const e = map.get(r.playerId) || { name: r.playerName, nickname: r.playerNickname, folded: 0, total: 0 };
      e.total++;
      if (!r.participated) e.folded++;
      map.set(r.playerId, e);
    }
    const entries = [...map.entries()]
      .filter(([_, d]) => d.total >= 10)
      .map(([id, d]) => ({ playerId: id, name: d.name, nickname: d.nickname, value: Math.round((d.folded / d.total) * 100), detail: `${d.folded}/${d.total} manos` }))
      .sort((a, b) => b.value - a.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { statId: "fold-rate", title: "Fold Rate", emoji: "🪑", description: "Porcentaje de manos donde no entró (mín 10 registros)", unit: "%", entries };
  },
};

export async function getLadder(statId: string): Promise<LadderResult | null> {
  const generator = LADDER_GENERATORS[statId];
  if (!generator) return null;
  return generator();
}

export function getAvailableStats(): { id: string; title: string; emoji: string }[] {
  return [
    { id: "points", title: "Puntos Totales", emoji: "🏆" },
    { id: "points-per-session", title: "Eficiencia", emoji: "📈" },
    { id: "wins", title: "Victorias", emoji: "👑" },
    { id: "podiums", title: "Podios", emoji: "🥉" },
    { id: "volatility", title: "Volatilidad", emoji: "🎰" },
    { id: "consistency", title: "Consistencia", emoji: "🧘" },
    { id: "hands-won", title: "Manos Ganadas", emoji: "🖐️" },
    { id: "win-rate", title: "Win Rate", emoji: "🎯" },
    { id: "all-ins", title: "All-Ins", emoji: "🤠" },
    { id: "all-in-survival", title: "Supervivencia All-In", emoji: "🐊" },
    { id: "kills", title: "Eliminaciones", emoji: "🗡️" },
    { id: "drinks", title: "Cervezas", emoji: "🍺" },
    { id: "fold-rate", title: "Fold Rate", emoji: "🪑" },
  ];
}
