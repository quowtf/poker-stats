import { db } from "@/db";
import {
  hands,
  handPlayers,
  players,
  sessionInsights,
  substitutions,
  HAND_TYPE_LABELS,
  HAND_TYPE_STRENGTH,
} from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type InsightInput = {
  emoji: string;
  message: string;
  type: "streak" | "rivalry" | "allIn" | "prediction" | "historical" | "elimination" | "milestone";
};

type InsightCandidate = InsightInput & {
  priority: number;
  // "hand" (default) = persisted, tied to the hand; "table" = rolling, live-only.
  scope?: "hand" | "table";
  // Stable rule+entity key (e.g. "fold_streak:<playerId>"). When set, the insight
  // is suppressed if the same key fired within `cooldownHands` hands.
  dedupKey?: string;
  cooldownHands?: number;
};

// Fallback cooldown when a candidate sets a dedupKey but no explicit window.
const DEFAULT_COOLDOWN_HANDS = 5;

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
    .select({
      id: hands.id,
      handNumber: hands.handNumber,
      dealerId: hands.dealerId,
      sbId: hands.sbId,
      winningHandType: hands.winningHandType,
      createdAt: hands.createdAt,
    })
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

  // Substitutions (a player leaves and hands their chips to an eliminated
  // player). Used to narrate revivals. Names come from aliased player joins.
  const reviver = alias(players, "reviver");
  const revived = alias(players, "revived");
  const sessionSubs = await db
    .select({
      handNumber: substitutions.handNumber,
      reviverId: substitutions.leftPlayerId,
      revivedId: substitutions.revivedPlayerId,
      reviverName: reviver.name,
      reviverNickname: reviver.nickname,
      revivedName: revived.name,
      revivedNickname: revived.nickname,
    })
    .from(substitutions)
    .innerJoin(reviver, eq(substitutions.leftPlayerId, reviver.id))
    .innerJoin(revived, eq(substitutions.revivedPlayerId, revived.id))
    .where(eq(substitutions.sessionId, sessionId))
    .orderBy(asc(substitutions.handNumber));

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

  const candidates: InsightCandidate[] = [];

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
      dedupKey: winner ? `hot_streak:${winner.playerId}` : undefined,
      cooldownHands: 3,
    });
  }

  // 🥶 Cold streak (5+ without winning, only alive players)
  for (const [playerId, stats] of playerStats) {
    if (!stats.isEliminated && stats.lossStreak >= 5 && stats.handsPlayed >= 5) {
      candidates.push({
        emoji: "🥶",
        message: `${stats.nickname || stats.name} lleva ${stats.lossStreak} manos sin ganar`,
        type: "streak",
        priority: Math.min(stats.lossStreak, 10),
        dedupKey: `cold_streak:${playerId}`,
        cooldownHands: 6,
      });
    }
  }

  // 🪑 Fold streak (3+ consecutive folds — playing tight/scared)
  for (const [playerId, stats] of playerStats) {
    if (!stats.isEliminated && stats.foldStreak >= 3) {
      candidates.push({
        emoji: "🪑",
        message: `${stats.nickname || stats.name} lleva ${stats.foldStreak} manos sin entrar — jugando tight`,
        type: "streak",
        priority: stats.foldStreak + 2,
        dedupKey: `fold_streak:${playerId}`,
        cooldownHands: 4,
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
        dedupKey: `allin_hand:${hp.playerId}`,
        cooldownHands: 0,
      });
    } else if (!hp.eliminated && hp.participated) {
      candidates.push({
        emoji: "😰",
        message: `${name} sobrevivió un ALL-IN por los pelos`,
        type: "allIn",
        priority: 6,
        dedupKey: `allin_hand:${hp.playerId}`,
        cooldownHands: 0,
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
        dedupKey: `allin_survival:${hp.playerId}`,
        cooldownHands: 6,
      });
    }
  }

  // ─── Winning hand type ─────────────────────────────────────────────────────
  // `winningHandType` is optional (the admin may not capture it). Every rule
  // below degrades gracefully when it's null.

  const currentHand = sessionHands.find((h) => h.id === handId);
  const currentType = currentHand?.winningHandType ?? null;

  if (currentType && winner) {
    const label = HAND_TYPE_LABELS[currentType]?.es ?? currentType;
    const typeEmoji = HAND_TYPE_LABELS[currentType]?.emoji ?? "🃏";
    const strength = HAND_TYPE_STRENGTH[currentType] ?? 0;

    // Hands strictly before the current one, used for "best so far" and
    // "first time tonight" checks.
    const previousTypes = sessionHands
      .filter((h) => h.handNumber < currentHandNumber && h.winningHandType)
      .map((h) => h.winningHandType!);

    // 🍀 Rare hand: first occurrence of a premium type tonight.
    const RARE_TYPES = new Set(["four_of_a_kind", "straight_flush", "royal_flush"]);
    const isRareFirst =
      RARE_TYPES.has(currentType) && !previousTypes.includes(currentType);

    if (isRareFirst) {
      candidates.push({
        emoji: typeEmoji,
        message: `Primera ${label} de la noche, cortesía de ${winnerName}`,
        type: "historical",
        priority: 8,
        dedupKey: `first_type:${currentType}`,
        cooldownHands: 0,
      });
    } else {
      // 🎰 Best hand of the night so far (straight or better).
      const previousBest = previousTypes.reduce(
        (max, t) => Math.max(max, HAND_TYPE_STRENGTH[t] ?? 0),
        0
      );
      if (strength >= 5 && strength > previousBest) {
        candidates.push({
          emoji: "🎰",
          message: `${winnerName} se lleva el bote con ${label} — la mano más fuerte de la noche`,
          type: "historical",
          priority: 9,
          dedupKey: "best_hand",
          cooldownHands: 0,
        });
      }
    }

    // 🃏 Thief: winning with a weak hand.
    if (currentType === "high_card" || currentType === "pair") {
      candidates.push({
        emoji: "🃏",
        message: `${winnerName} se lleva el bote con ${label.toLowerCase()}. Robo descarado.`,
        type: "historical",
        priority: 5,
        dedupKey: `thief:${winner.playerId}`,
        cooldownHands: 6,
      });
    }

    // 🎨 Flush tally: third flush of the night.
    if (currentType === "flush") {
      const flushCount = sessionHands.filter(
        (h) => h.handNumber <= currentHandNumber && h.winningHandType === "flush"
      ).length;
      if (flushCount === 3) {
        candidates.push({
          emoji: "🎨",
          message: `${winnerName}: 3er color de la noche`,
          type: "milestone",
          priority: 5,
          dedupKey: "flush_tally",
          cooldownHands: 3,
        });
      }
    }
  }

  // ─── Position (big blind / small blind) ───────────────────────────────────
  // House convention: `dealerId` is the BIG BLIND (D = BB), and `sbId` is the
  // small blind (seat to the dealer's left). Both are optional and may be null
  // on older or poorly captured sessions. If a hand ever has dealer === sb
  // (defensive; shouldn't happen with this convention), it's ignored for the
  // position-variety rule to avoid trivial firing.

  const winnerByHand = new Map<string, string>();
  for (const hp of allHandPlayers) {
    if (hp.won) winnerByHand.set(hp.handId, hp.playerId);
  }

  const dealerWins = new Map<string, number>();
  const sbHands = new Map<string, number>();
  const sbWins = new Map<string, number>();
  const multiwayDealerWins = new Map<string, number>();
  const multiwaySbWins = new Map<string, number>();

  for (const hand of sessionHands) {
    const winnerId = winnerByHand.get(hand.id);
    const isHeadsUpHand =
      hand.dealerId !== null && hand.sbId !== null && hand.dealerId === hand.sbId;

    if (hand.dealerId) {
      if (winnerId === hand.dealerId) {
        dealerWins.set(hand.dealerId, (dealerWins.get(hand.dealerId) ?? 0) + 1);
        if (!isHeadsUpHand) {
          multiwayDealerWins.set(
            hand.dealerId,
            (multiwayDealerWins.get(hand.dealerId) ?? 0) + 1
          );
        }
      }
    }

    if (hand.sbId) {
      sbHands.set(hand.sbId, (sbHands.get(hand.sbId) ?? 0) + 1);
      if (winnerId === hand.sbId) {
        sbWins.set(hand.sbId, (sbWins.get(hand.sbId) ?? 0) + 1);
        if (!isHeadsUpHand) {
          multiwaySbWins.set(
            hand.sbId,
            (multiwaySbWins.get(hand.sbId) ?? 0) + 1
          );
        }
      }
    }
  }

  if (winner) {
    const winsFromButton = dealerWins.get(winner.playerId) ?? 0;

    // 🪙 BB machine: third win from the big blind tonight.
    if (winsFromButton >= 3 && currentHand?.dealerId === winner.playerId) {
      candidates.push({
        emoji: "🪙",
        message: `${winnerName} gana por ${winsFromButton}ª vez desde el BB esta noche`,
        type: "streak",
        priority: 6,
        dedupKey: `bb_win:${winner.playerId}`,
        cooldownHands: 4,
      });
    }

    // 🎯 Position wildcard: wins from both the big blind and the small blind.
    const winsFromSb = multiwaySbWins.get(winner.playerId) ?? 0;
    const winsFromButtonMultiway = multiwayDealerWins.get(winner.playerId) ?? 0;
    if (winsFromButtonMultiway >= 1 && winsFromSb >= 1) {
      candidates.push({
        emoji: "🎯",
        message: `${winnerName} saca botes desde el BB y desde el SB`,
        type: "historical",
        priority: 6,
        dedupKey: `any_position:${winner.playerId}`,
        cooldownHands: 6,
      });
    }
  }

  // 💸 Small-blind tax: alive player with 3+ SB hands and zero SB wins.
  for (const [playerId, stats] of playerStats) {
    if (stats.isEliminated) continue;
    const handsInSb = sbHands.get(playerId) ?? 0;
    const winsInSb = sbWins.get(playerId) ?? 0;
    if (handsInSb >= 3 && winsInSb === 0) {
      candidates.push({
        emoji: "💸",
        message: `${stats.nickname || stats.name} paga ciego chico y sigue sin cobrar — el SB le pesa`,
        type: "streak",
        priority: 5,
        dedupKey: `sb_tax:${playerId}`,
        cooldownHands: 8,
      });
    }
  }

  // ─── Revivals (substitutions) ──────────────────────────────────────────────
  // A substitution at hand N means a player left and gave their chips to an
  // eliminated player, reviving them. NOTE: `substitute/route.ts` stores
  // `handNumber = number of hands already recorded`, so a substitution made
  // after hand N has handNumber N and takes effect on hand N+1. We therefore
  // match N or N+1 to be robust to both insertion timings.

  const currentSubs = sessionSubs.filter(
    (s) =>
      s.handNumber === currentHandNumber - 1 ||
      s.handNumber === currentHandNumber
  );
  for (const sub of currentSubs) {
    const revivedName = sub.revivedNickname || sub.revivedName;
    const reviverName = sub.reviverNickname || sub.reviverName;
    const timesRevived = sessionSubs.filter((s) => s.revivedId === sub.revivedId).length;

    if (timesRevived >= 2) {
      candidates.push({
        emoji: "⚰️",
        message: `${revivedName} ya va por su ${timesRevived}ª vida esta noche — ${reviverName} lo revivió otra vez`,
        type: "historical",
        priority: 7,
        dedupKey: `revival:${sub.revivedId}:${sub.handNumber}`,
        cooldownHands: 0,
      });
    } else {
      candidates.push({
        emoji: "🧟",
        message: `${revivedName} volvió de la muerte: ${reviverName} le pasó fichas`,
        type: "historical",
        priority: 7,
        dedupKey: `revival:${sub.revivedId}:${sub.handNumber}`,
        cooldownHands: 0,
      });
    }
  }

  // ─── Pace / timing ────────────────────────────────────────────────────────
  // `createdAt` is the recording time, not the actual deal time, so these
  // insights are approximate and kept at low priority.

  const handTimes = sessionHands
    .map((h) => ({
      handNumber: h.handNumber,
      at:
        h.createdAt instanceof Date
          ? h.createdAt.getTime()
          : new Date(h.createdAt).getTime(),
    }))
    .filter((h) => Number.isFinite(h.at))
    .sort((a, b) => a.handNumber - b.handNumber);

  const intervals: { handNumber: number; ms: number }[] = [];
  for (let i = 1; i < handTimes.length; i++) {
    const ms = handTimes[i].at - handTimes[i - 1].at;
    if (ms > 0) intervals.push({ handNumber: handTimes[i].handNumber, ms });
  }

  if (intervals.length >= 2) {
    const sortedMs = [...intervals.map((i) => i.ms)].sort((a, b) => a - b);
    const medianMs = sortedMs[Math.floor(sortedMs.length / 2)];

    // 🐢 Slow hand: last hand took 3x the median (and at least 2 minutes).
    const lastInterval = intervals.find((i) => i.handNumber === currentHandNumber);
    if (
      medianMs > 0 &&
      lastInterval &&
      lastInterval.ms > medianMs * 3 &&
      lastInterval.ms >= 2 * 60_000
    ) {
      const minutes = Math.round(lastInterval.ms / 60_000);
      candidates.push({
        emoji: "🐢",
        message: `La última mano duró ${minutes} min — la mesa se durmió`,
        type: "historical",
        priority: 5,
        dedupKey: "slow_hand",
        cooldownHands: 5,
      });
    }

    // ⚡ Fast streak: last 3 hands well below the median pace.
    const lastThree = intervals.slice(-3);
    if (
      medianMs > 0 &&
      lastThree.length === 3 &&
      lastThree.every((i) => i.ms < medianMs * 0.6)
    ) {
      candidates.push({
        emoji: "⚡",
        message: "3 manos seguidas a toda velocidad",
        type: "historical",
        priority: 4,
        dedupKey: "fast_streak",
        cooldownHands: 6,
      });
    }

    // ⏱️ Pace trend: recent 5 hands vs the overall pace of the session.
    const elapsedMs = handTimes[handTimes.length - 1].at - handTimes[0].at;
    const overallPace =
      elapsedMs > 0
        ? Math.round(intervals.length / (elapsedMs / 3_600_000))
        : 0;
    const recent = intervals.slice(-5);
    const recentMs = recent.reduce((sum, i) => sum + i.ms, 0);
    const recentPace =
      recentMs > 0 ? Math.round(recent.length / (recentMs / 3_600_000)) : 0;

    if (overallPace > 0 && recentPace > overallPace * 1.5 && recentPace >= 30) {
      candidates.push({
        emoji: "⏱️",
        message: `La mesa aceleró: ${recentPace} manos/hora en las últimas 5`,
        type: "historical",
        priority: 4,
        dedupKey: "pace",
        cooldownHands: 10,
      });
    } else if (overallPace >= 15 && recentPace < overallPace * 0.6) {
      candidates.push({
        emoji: "🐌",
        message: `La mesa se enfrió: ${recentPace} manos/hora en las últimas 5`,
        type: "historical",
        priority: 4,
        dedupKey: "pace",
        cooldownHands: 10,
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
          dedupKey: "leader_takeover",
          cooldownHands: 0,
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
        dedupKey: "gap_close",
        cooldownHands: 0,
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
        dedupKey: `h2h:${winner.playerId}:${mostBeaten[0]}`,
        cooldownHands: 0,
      });
    }
  }

  // 🍺 Drinks correlation (player drinking heavy and still winning or losing badly)
  for (const [playerId, stats] of playerStats) {
    if (stats.totalDrinks >= 4 && stats.handsPlayed >= 5) {
      const name = stats.nickname || stats.name;
      const winRate = Math.round((stats.handsWon / stats.handsPlayed) * 100);
      if (winRate >= 30) {
        candidates.push({
          emoji: "🍺",
          message: `${name} lleva ${stats.totalDrinks} 🍺 y sigue ganando (${winRate}% win rate)`,
          type: "milestone",
          priority: 5,
          dedupKey: `drinks_win:${playerId}`,
          cooldownHands: 8,
        });
      } else if (winRate <= 10 && stats.totalDrinks >= 5) {
        candidates.push({
          emoji: "🫠",
          message: `${name}: ${stats.totalDrinks} 🍺 y ${winRate}% win rate — la cerveza cobra factura`,
          type: "milestone",
          priority: 6,
          dedupKey: `drinks_loss:${playerId}`,
          cooldownHands: 8,
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

    for (const [playerId, stats] of playerStats) {
      if (stats.isEliminated || stats.handsPlayed < 5) continue;
      const playerWinRate = stats.handsWon / stats.handsPlayed;
      if (playerWinRate > avgWinRate * 2.5 && stats.handsWon >= 4) {
        candidates.push({
          emoji: "📊",
          message: `${stats.nickname || stats.name} gana ${Math.round(playerWinRate * 100)}% — el doble del promedio de la mesa`,
          type: "historical",
          priority: 5,
          dedupKey: `wr_disparity:${playerId}`,
          cooldownHands: 8,
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
      dedupKey: winner ? `milestone_5:${winner.playerId}` : undefined,
      cooldownHands: 0,
    });
  }
  if (winnerStats && winnerStats.handsWon === 10) {
    candidates.push({
      emoji: "🌟",
      message: `${winnerName} llega a 10 manos — dominando`,
      type: "milestone",
      priority: 8,
      dedupKey: winner ? `milestone_10:${winner.playerId}` : undefined,
      cooldownHands: 0,
    });
  }

  // ─── Cooldown / anti-repetición ────────────────────────────────────────────
  // Discard candidates whose dedupKey already fired within their cooldown
  // window (measured in hands). This keeps repeating patterns (streaks, drinks,
  // win-rate disparity) from flooding consecutive hands with near-identical
  // messages.

  const recentInsights = await db
    .select({ handId: sessionInsights.handId, dedupKey: sessionInsights.dedupKey })
    .from(sessionInsights)
    .where(eq(sessionInsights.sessionId, sessionId))
    .orderBy(desc(sessionInsights.createdAt))
    .limit(200);

  const handNumberById = new Map(sessionHands.map((h) => [h.id, h.handNumber]));
  const lastSeenHand = new Map<string, number>();
  for (const row of recentInsights) {
    if (!row.dedupKey || !row.handId) continue;
    const handNumber = handNumberById.get(row.handId);
    if (handNumber === undefined) continue;
    const prev = lastSeenHand.get(row.dedupKey);
    if (prev === undefined || handNumber > prev) {
      lastSeenHand.set(row.dedupKey, handNumber);
    }
  }

  const freshCandidates = candidates.filter((candidate) => {
    if (!candidate.dedupKey) return true;
    const lastHand = lastSeenHand.get(candidate.dedupKey);
    if (lastHand === undefined) return true;
    const cooldown = candidate.cooldownHands ?? DEFAULT_COOLDOWN_HANDS;
    return currentHandNumber - lastHand > cooldown;
  });

  // One candidate per dedupKey within this hand (highest priority wins). Without
  // this, two rules sharing a key (or duplicate substitutions) could persist the
  // same message twice in the same hand.
  const byKey = new Map<string, InsightCandidate>();
  const keyless: InsightCandidate[] = [];
  for (const candidate of freshCandidates) {
    if (!candidate.dedupKey) {
      keyless.push(candidate);
      continue;
    }
    const existing = byKey.get(candidate.dedupKey);
    if (!existing || candidate.priority > existing.priority) {
      byKey.set(candidate.dedupKey, candidate);
    }
  }
  const dedupedCandidates = [...byKey.values(), ...keyless];

  // ─── Pick top 3-5 ─────────────────────────────────────────────────────────

  dedupedCandidates.sort((a, b) => b.priority - a.priority);

  const highPriority = dedupedCandidates.filter((c) => c.priority >= 7);
  const count = Math.min(5, Math.max(3, highPriority.length + 1));
  const selected = dedupedCandidates.slice(0, count);

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
        scope: insight.scope ?? "hand",
        dedupKey: insight.dedupKey ?? null,
        emoji: insight.emoji,
        message: insight.message,
        type: insight.type,
      }))
    );
  }
}
