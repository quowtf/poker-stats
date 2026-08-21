import { db } from "@/db";
import {
  hands,
  handPlayers,
  players,
  sessionInsights,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";

type InsightInput = {
  emoji: string;
  message: string;
  type: "streak" | "rivalry" | "allIn" | "prediction" | "historical" | "elimination" | "milestone";
};

/**
 * Generate and persist 3-5 NON-OBVIOUS insights for a hand that was just recorded.
 * Rules:
 * - No insights about things players can see (eliminations, who's alive)
 * - Focus on hidden patterns, streaks, correlations, head-to-head dominance
 */
export async function generateInsightsForHand(
  sessionId: string,
  handId: string
): Promise<void> {
  const sessionHands = await db
    .select({ id: hands.id, handNumber: hands.handNumber })
    .from(hands)
    .where(eq(hands.sessionId, sessionId))
    .orderBy(asc(hands.handNumber));

  const allHandPlayers = await db
    .select({
      handId: handPlayers.handId,
      playerId: handPlayers.playerId,
      playerName: players.name,
      playerNickname: players.nickname,
      participated: handPlayers.participated,
      won: handPlayers.won,
      wentAllIn: handPlayers.wentAllIn,
      eliminated: handPlayers.eliminated,
      drinks: handPlayers.drinks,
    })
    .from(handPlayers)
    .innerJoin(players, eq(handPlayers.playerId, players.id))
    .innerJoin(hands, eq(handPlayers.handId, hands.id))
    .where(eq(hands.sessionId, sessionId));

  const currentHandPlayers = allHandPlayers.filter((hp) => hp.handId === handId);
  const currentHandNumber = sessionHands.find((h) => h.id === handId)?.handNumber || 0;

  // ─── Aggregate player stats across session ─────────────────────────────────

  type PlayerSessionStats = {
    name: string;
    nickname: string | null;
    handsWon: number;
    handsPlayed: number;
    handsFolded: number; // times not participated while alive
    allIns: number;
    allInsSurvived: number;
    totalDrinks: number;
    isEliminated: boolean;
    winStreak: number;
    lossStreak: number;
    foldStreak: number; // consecutive hands not playing
    winsPerHand: number[]; // track hand numbers where they won
  };

  const playerStats = new Map<string, PlayerSessionStats>();
  const allPlayerIds = new Set<string>();

  for (const hand of sessionHands) {
    const hps = allHandPlayers.filter((hp) => hp.handId === hand.id);
    const handPlayerIds = new Set(hps.map((hp) => hp.playerId));

    for (const hp of hps) {
      allPlayerIds.add(hp.playerId);
      const existing = playerStats.get(hp.playerId) || {
        name: hp.playerName,
        nickname: hp.playerNickname,
        handsWon: 0,
        handsPlayed: 0,
        handsFolded: 0,
        allIns: 0,
        allInsSurvived: 0,
        totalDrinks: 0,
        isEliminated: false,
        winStreak: 0,
        lossStreak: 0,
        foldStreak: 0,
        winsPerHand: [],
      };

      existing.totalDrinks += hp.drinks;

      if (hp.participated) {
        existing.handsPlayed++;
        existing.foldStreak = 0;
        if (hp.won) {
          existing.handsWon++;
          existing.winStreak++;
          existing.lossStreak = 0;
          existing.winsPerHand.push(hand.handNumber);
        } else {
          existing.lossStreak++;
          existing.winStreak = 0;
        }
        if (hp.wentAllIn) {
          existing.allIns++;
          if (!hp.eliminated) existing.allInsSurvived++;
        }
        if (hp.eliminated) existing.isEliminated = true;
      } else {
        // Alive but didn't play = fold
        if (!existing.isEliminated) {
          existing.handsFolded++;
          existing.foldStreak++;
        }
      }

      playerStats.set(hp.playerId, existing);
    }
  }

  // ─── Generate candidates ───────────────────────────────────────────────────

  const candidates: (InsightInput & { priority: number })[] = [];

  const winner = currentHandPlayers.find((hp) => hp.won);
  const winnerName = winner?.playerNickname || winner?.playerName || "?";
  const winnerStats = winner ? playerStats.get(winner.playerId) : null;

  // 🔥 Hot streak (3+ consecutive wins)
  if (winnerStats && winnerStats.winStreak >= 3) {
    candidates.push({
      emoji: "🔥",
      message: `${winnerName} lleva ${winnerStats.winStreak} manos seguidas`,
      type: "streak",
      priority: winnerStats.winStreak * 4,
    });
  }

  // 🥶 Cold streak (5+ without winning, only alive players)
  for (const [_, stats] of playerStats) {
    if (!stats.isEliminated && stats.lossStreak >= 5 && stats.handsPlayed >= 5) {
      candidates.push({
        emoji: "🥶",
        message: `${stats.nickname || stats.name} lleva ${stats.lossStreak} manos sin ganar`,
        type: "streak",
        priority: Math.min(stats.lossStreak, 10),
      });
    }
  }

  // 🪑 Fold streak (3+ consecutive folds — playing tight/scared)
  for (const [_, stats] of playerStats) {
    if (!stats.isEliminated && stats.foldStreak >= 3) {
      candidates.push({
        emoji: "🪑",
        message: `${stats.nickname || stats.name} lleva ${stats.foldStreak} manos sin entrar — jugando tight`,
        type: "streak",
        priority: stats.foldStreak + 2,
      });
    }
  }

  // 🐊 All-in + won (dramatic survival)
  const allInPlayers = currentHandPlayers.filter((hp) => hp.wentAllIn);
  for (const hp of allInPlayers) {
    const name = hp.playerNickname || hp.playerName;
    const stats = playerStats.get(hp.playerId);
    if (hp.won) {
      candidates.push({
        emoji: "🐊",
        message: `${name} fue ALL-IN y se llevó la mano`,
        type: "allIn",
        priority: 8,
      });
    } else if (!hp.eliminated && hp.participated) {
      candidates.push({
        emoji: "😰",
        message: `${name} sobrevivió un ALL-IN por los pelos`,
        type: "allIn",
        priority: 6,
      });
    }

    // Accumulative all-in stat (hidden pattern)
    if (stats && stats.allIns >= 4) {
      const survivalRate = Math.round((stats.allInsSurvived / stats.allIns) * 100);
      candidates.push({
        emoji: survivalRate >= 70 ? "🛡️" : "⚠️",
        message: `${name}: ${stats.allIns} all-ins esta noche, ${survivalRate}% survival`,
        type: "allIn",
        priority: 5,
      });
    }
  }

  // 👑 New leader (just took the lead)
  const sortedByWins = [...playerStats.entries()]
    .filter(([_, s]) => !s.isEliminated)
    .sort((a, b) => b[1].handsWon - a[1].handsWon);

  if (sortedByWins.length >= 2 && winner) {
    const leader = sortedByWins[0];
    const second = sortedByWins[1];

    if (winner.playerId === leader[0] && winnerStats && winnerStats.handsWon > 1) {
      const prevWins = winnerStats.handsWon - 1;
      if (prevWins <= second[1].handsWon) {
        candidates.push({
          emoji: "👑",
          message: `${winnerName} toma el liderato con ${winnerStats.handsWon} manos`,
          type: "prediction",
          priority: 10,
        });
      }
    }

    // ⚡ Gap closing
    const gap = leader[1].handsWon - second[1].handsWon;
    if (gap === 1) {
      const secondName = second[1].nickname || second[1].name;
      const leaderName = leader[1].nickname || leader[1].name;
      candidates.push({
        emoji: "⚡",
        message: `${secondName} a 1 mano de alcanzar a ${leaderName}`,
        type: "prediction",
        priority: 7,
      });
    }
  }

  // 🧿 Head-to-head dominance (winner has beaten someone 3+ times this session)
  if (winner) {
    const winsAgainst = new Map<string, number>();
    for (const hand of sessionHands) {
      const hps = allHandPlayers.filter((hp) => hp.handId === hand.id);
      const handWinner = hps.find((hp) => hp.won);
      if (handWinner?.playerId === winner.playerId) {
        for (const hp of hps) {
          if (hp.playerId !== winner.playerId && hp.participated) {
            winsAgainst.set(hp.playerId, (winsAgainst.get(hp.playerId) || 0) + 1);
          }
        }
      }
    }
    const mostBeaten = [...winsAgainst.entries()].sort((a, b) => b[1] - a[1])[0];
    if (mostBeaten && mostBeaten[1] >= 3) {
      const victimStats = playerStats.get(mostBeaten[0]);
      const victimName = victimStats?.nickname || victimStats?.name || "?";
      candidates.push({
        emoji: "🧿",
        message: `${winnerName} le ha ganado ${mostBeaten[1]} manos a ${victimName}`,
        type: "rivalry",
        priority: 6,
      });
    }
  }

  // 🍺 Drinks correlation (player drinking heavy and still winning or losing badly)
  for (const [_, stats] of playerStats) {
    if (stats.totalDrinks >= 4 && stats.handsPlayed >= 5) {
      const name = stats.nickname || stats.name;
      const winRate = Math.round((stats.handsWon / stats.handsPlayed) * 100);
      if (winRate >= 30) {
        candidates.push({
          emoji: "🍺",
          message: `${name} lleva ${stats.totalDrinks} 🍺 y sigue ganando (${winRate}% win rate)`,
          type: "milestone",
          priority: 5,
        });
      } else if (winRate <= 10 && stats.totalDrinks >= 5) {
        candidates.push({
          emoji: "🫠",
          message: `${name}: ${stats.totalDrinks} 🍺 y ${winRate}% win rate — la cerveza cobra factura`,
          type: "milestone",
          priority: 6,
        });
      }
    }
  }

  // 📊 Win rate disparity (someone dominating vs average)
  if (currentHandNumber >= 8) {
    const avgWinRate = currentHandNumber > 0
      ? [...playerStats.values()].filter((s) => !s.isEliminated).reduce((sum, s) => sum + s.handsWon, 0) /
        Math.max([...playerStats.values()].filter((s) => !s.isEliminated).length, 1) / currentHandNumber
      : 0;

    for (const [_, stats] of playerStats) {
      if (stats.isEliminated || stats.handsPlayed < 5) continue;
      const playerWinRate = stats.handsWon / stats.handsPlayed;
      if (playerWinRate > avgWinRate * 2.5 && stats.handsWon >= 4) {
        candidates.push({
          emoji: "📊",
          message: `${stats.nickname || stats.name} gana ${Math.round(playerWinRate * 100)}% — el doble del promedio de la mesa`,
          type: "historical",
          priority: 5,
        });
      }
    }
  }

  // ⭐ Milestones (5, 10 manos ganadas)
  if (winnerStats && winnerStats.handsWon === 5) {
    candidates.push({
      emoji: "⭐",
      message: `${winnerName} llega a 5 manos ganadas`,
      type: "milestone",
      priority: 6,
    });
  }
  if (winnerStats && winnerStats.handsWon === 10) {
    candidates.push({
      emoji: "🌟",
      message: `${winnerName} llega a 10 manos — dominando`,
      type: "milestone",
      priority: 8,
    });
  }

  // ─── Pick top 3-5 ─────────────────────────────────────────────────────────

  candidates.sort((a, b) => b.priority - a.priority);

  const highPriority = candidates.filter((c) => c.priority >= 7);
  const count = Math.min(5, Math.max(3, highPriority.length + 1));
  const selected = candidates.slice(0, count);

  // Fallback: if nothing interesting, just note the winner
  if (selected.length === 0) {
    selected.push({
      emoji: "🃏",
      message: `${winnerName} gana la mano #${currentHandNumber}`,
      type: "historical",
      priority: 1,
    });
  }

  // Persist
  if (selected.length > 0) {
    await db.insert(sessionInsights).values(
      selected.map((insight) => ({
        sessionId,
        handId,
        emoji: insight.emoji,
        message: insight.message,
        type: insight.type,
      }))
    );
  }
}
