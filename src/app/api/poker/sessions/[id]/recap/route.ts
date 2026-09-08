import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, sessionPlayers, hands, handPlayers, players, sessionInsights } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    // Session players
    const sPlayers = await db
      .select({
        playerId: sessionPlayers.playerId,
        finishPosition: sessionPlayers.finishPosition,
        name: players.name,
        nickname: players.nickname,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(eq(sessionPlayers.sessionId, sessionId));

    // All hands ordered
    const allHands = await db
      .select({ id: hands.id, handNumber: hands.handNumber, dealerId: hands.dealerId, sbId: hands.sbId, winningHandType: hands.winningHandType })
      .from(hands)
      .where(eq(hands.sessionId, sessionId))
      .orderBy(asc(hands.handNumber));

    // All hand_players for this session
    const allHP = await db
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
      .innerJoin(hands, eq(handPlayers.handId, hands.id))
      .where(eq(hands.sessionId, sessionId));

    // Build race chart data: cumulative wins per player per hand
    const playerColors = ["#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];
    const playerList = sPlayers.map((p, i) => ({
      id: p.playerId,
      name: p.nickname || p.name,
      color: playerColors[i % playerColors.length],
      finishPosition: p.finishPosition,
    }));

    const raceData: { handNumber: number; wins: Record<string, number> }[] = [];
    const cumulativeWins: Record<string, number> = {};
    playerList.forEach((p) => { cumulativeWins[p.id] = 0; });

    const eliminatedAtHand: Record<string, number> = {};
    const allInAtHands: { playerId: string; handNumber: number }[] = [];

    // Stacked chart data
    // Mode "wins": each player's band = cumulative wins (dominance grows)
    // Mode "survival": each player's band = 1 while alive, 0 after elimination (bands vanish, AoE2-style)
    const winsSeries: { handNumber: number; values: Record<string, number> }[] = [];
    const survivalSeries: { handNumber: number; values: Record<string, number> }[] = [];

    // Determine elimination hand per player first
    const elimHandMap: Record<string, number> = {};
    for (const hand of allHands) {
      const hps = allHP.filter((hp) => hp.handId === hand.id);
      for (const hp of hps) {
        if (hp.eliminated && elimHandMap[hp.playerId] === undefined) {
          elimHandMap[hp.playerId] = hand.handNumber;
        }
      }
    }

    // Events for markers
    type ChartEvent = {
      handNumber: number;
      playerId: string;
      playerName: string;
      type: "allin_win" | "allin_survive" | "elimination" | "strong_hand" | "leader_change";
      emoji: string;
      label: string;
    };
    const events: ChartEvent[] = [];

    const strongHands = ["full_house", "four_of_a_kind", "straight_flush", "royal_flush"];
    let prevLeader: string | null = null;

    // Dominio: each player starts with weight 1. When eliminated,
    // their weight transfers to whoever won that hand (the eliminator).
    // The eliminator's band grows — visually "takes over" the loser's space.
    const dominion: Record<string, number> = {};
    playerList.forEach((p) => { dominion[p.id] = 1; });

    for (const hand of allHands) {
      const hps = allHP.filter((hp) => hp.handId === hand.id);
      const handWinner = hps.find((hp) => hp.won);

      for (const hp of hps) {
        const pName = playerList.find((p) => p.id === hp.playerId)?.name || "?";
        if (hp.won) {
          cumulativeWins[hp.playerId] = (cumulativeWins[hp.playerId] || 0) + 1;
          if (hand.winningHandType && strongHands.includes(hand.winningHandType)) {
            const labels: Record<string, string> = {
              full_house: "Full", four_of_a_kind: "Póker", straight_flush: "Esc. Color", royal_flush: "Esc. Real",
            };
            const emojis: Record<string, string> = {
              full_house: "🏠", four_of_a_kind: "🍀", straight_flush: "🌈", royal_flush: "👑",
            };
            events.push({
              handNumber: hand.handNumber, playerId: hp.playerId, playerName: pName,
              type: "strong_hand", emoji: emojis[hand.winningHandType] || "💎",
              label: `${pName} gana con ${labels[hand.winningHandType] || "mano fuerte"}`,
            });
          }
        }
        if (hp.eliminated) {
          eliminatedAtHand[hp.playerId] = hand.handNumber;
          // Transfer this player's dominion weight to the eliminator (hand winner)
          if (handWinner && handWinner.playerId !== hp.playerId) {
            dominion[handWinner.playerId] = (dominion[handWinner.playerId] || 0) + (dominion[hp.playerId] || 0);
          }
          dominion[hp.playerId] = 0;
          events.push({
            handNumber: hand.handNumber, playerId: hp.playerId, playerName: pName,
            type: "elimination", emoji: "💀", label: `${pName} eliminado`,
          });
        }
        if (hp.wentAllIn) {
          allInAtHands.push({ playerId: hp.playerId, handNumber: hand.handNumber });
          if (!hp.eliminated) {
            events.push({
              handNumber: hand.handNumber, playerId: hp.playerId, playerName: pName,
              type: hp.won ? "allin_win" : "allin_survive",
              emoji: hp.won ? "🐊" : "⚔️",
              label: hp.won ? `${pName} all-in y gana` : `${pName} all-in y sobrevive`,
            });
          }
        }
      }

      raceData.push({ handNumber: hand.handNumber, wins: { ...cumulativeWins } });
      // Dominio series (band grows as you eliminate others)
      winsSeries.push({ handNumber: hand.handNumber, values: { ...dominion } });

      // Survival: 1 if alive at this hand, else 0
      const survivalValues: Record<string, number> = {};
      for (const p of playerList) {
        const elim = elimHandMap[p.id];
        survivalValues[p.id] = elim !== undefined && hand.handNumber > elim ? 0 : 1;
      }
      survivalSeries.push({ handNumber: hand.handNumber, values: survivalValues });

      // Leader change marker (based on dominion now)
      const leaderEntry = Object.entries(dominion).sort((a, b) => b[1] - a[1])[0];
      if (leaderEntry && leaderEntry[0] !== prevLeader) {
        const lName = playerList.find((p) => p.id === leaderEntry[0])?.name || "?";
        if (prevLeader !== null) {
          events.push({
            handNumber: hand.handNumber, playerId: leaderEntry[0], playerName: lName,
            type: "leader_change", emoji: "👑", label: `${lName} domina la mesa`,
          });
        }
        prevLeader = leaderEntry[0];
      }
    }

    // MVPs
    const playerStats: Record<string, { handsWon: number; allIns: number; drinks: number; kills: number }> = {};
    for (const p of playerList) {
      playerStats[p.id] = { handsWon: 0, allIns: 0, drinks: 0, kills: 0 };
    }

    for (const hand of allHands) {
      const hps = allHP.filter((hp) => hp.handId === hand.id);
      const winner = hps.find((hp) => hp.won);
      const eliminated = hps.filter((hp) => hp.eliminated);

      for (const hp of hps) {
        if (!playerStats[hp.playerId]) continue;
        if (hp.won) playerStats[hp.playerId].handsWon++;
        if (hp.wentAllIn) playerStats[hp.playerId].allIns++;
        playerStats[hp.playerId].drinks += hp.drinks;
      }
      if (winner && eliminated.length > 0) {
        if (playerStats[winner.playerId]) {
          playerStats[winner.playerId].kills += eliminated.length;
        }
      }
    }

    const mvps = [
      { emoji: "🏆", title: "Más manos ganadas", player: "", value: 0 },
      { emoji: "🗡️", title: "Más kills", player: "", value: 0 },
      { emoji: "🤠", title: "Más all-ins", player: "", value: 0 },
      { emoji: "🍺", title: "Más cervezas", player: "", value: 0 },
    ];

    for (const p of playerList) {
      const s = playerStats[p.id];
      if (!s) continue;
      if (s.handsWon > mvps[0].value) { mvps[0].value = s.handsWon; mvps[0].player = p.name; }
      if (s.kills > mvps[1].value) { mvps[1].value = s.kills; mvps[1].player = p.name; }
      if (s.allIns > mvps[2].value) { mvps[2].value = s.allIns; mvps[2].player = p.name; }
      if (s.drinks > mvps[3].value) { mvps[3].value = s.drinks; mvps[3].player = p.name; }
    }

    // Timeline (hand-by-hand events)
    const timeline: { handNumber: number; events: string[] }[] = [];
    for (const hand of allHands) {
      const hps = allHP.filter((hp) => hp.handId === hand.id);
      const events: string[] = [];
      const winner = hps.find((hp) => hp.won);
      const eliminated = hps.filter((hp) => hp.eliminated);
      const allInPlayers = hps.filter((hp) => hp.wentAllIn);

      if (winner) {
        const wName = playerList.find((p) => p.id === winner.playerId)?.name || "?";
        events.push(`🏆 ${wName} gana`);
      }
      for (const ai of allInPlayers) {
        const name = playerList.find((p) => p.id === ai.playerId)?.name || "?";
        if (ai.eliminated) {
          events.push(`💀 ${name} all-in → eliminado`);
        } else if (ai.won) {
          events.push(`🐊 ${name} all-in → gana`);
        } else {
          events.push(`😰 ${name} all-in → sobrevive`);
        }
      }
      if (events.length > 0) {
        timeline.push({ handNumber: hand.handNumber, events });
      }
    }

    // Insights from this session
    const insights = await db
      .select({ emoji: sessionInsights.emoji, message: sessionInsights.message })
      .from(sessionInsights)
      .where(eq(sessionInsights.sessionId, sessionId))
      .orderBy(asc(sessionInsights.createdAt));

    // Top insight (highest drama)
    const topInsight = insights.length > 0 ? insights[insights.length - 1] : null;

    return NextResponse.json({
      session: {
        id: session.id,
        playedAt: session.playedAt,
        playerCount: session.playerCount,
        totalHands: allHands.length,
      },
      players: playerList,
      raceData,
      winsSeries,
      survivalSeries,
      events,
      eliminatedAtHand,
      allInAtHands,
      mvps: mvps.filter((m) => m.value > 0),
      playerStats,
      timeline,
      insights,
      topInsight,
    });
  } catch (error) {
    console.error("Error fetching recap:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
