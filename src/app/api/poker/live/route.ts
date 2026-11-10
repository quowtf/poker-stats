import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  sessions,
  sessionPlayers,
  sessionInsights,
  hands,
  handPlayers,
  players,
} from "@/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { buildTableInsights, themeOfHandInsight } from "@/lib/live-insights";
import { getPlayerRelations, loadRelationData } from "@/lib/player-relations";

// The live view only needs three historical facts per player (kryptonite,
// nemesis, current streak). They are computed in BATCH from 3 queries for the
// whole table, instead of loading the full PlayerProfile per player (~13
// queries each).
//
// They are loaded only when the payload has to be recomputed (i.e. when the
// session version changed), so the historical data is always fresh: no TTL,
// no stale kills.
async function loadRelations(aliveIds: string[]) {
  const data = await loadRelationData();
  return getPlayerRelations(aliveIds, data);
}

type SeatedPlayer = { playerId: string; seatOrder: number | null };

/** Active players sorted clockwise by seatOrder. */
function activeInSeatOrder(players: SeatedPlayer[]): SeatedPlayer[] {
  return [...players].sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0));
}

/** Seat to the RIGHT (counter-clockwise = previous seatOrder, wrapping). */
function seatToRight(players: SeatedPlayer[], fromPlayerId: string | null): string | null {
  const active = activeInSeatOrder(players);
  if (active.length === 0) return null;
  if (fromPlayerId === null) return active[0].playerId;
  const idx = active.findIndex((p) => p.playerId === fromPlayerId);
  if (idx === -1) return active[0].playerId;
  return active[(idx - 1 + active.length) % active.length].playerId;
}

/** Seat to the LEFT (clockwise = next seatOrder, wrapping). */
function seatToLeft(players: SeatedPlayer[], fromPlayerId: string | null): string | null {
  const active = activeInSeatOrder(players);
  if (active.length === 0) return null;
  if (fromPlayerId === null) return active[0].playerId;
  const idx = active.findIndex((p) => p.playerId === fromPlayerId);
  if (idx === -1) return active[0].playerId;
  return active[(idx + 1) % active.length].playerId;
}

// ─── Payload cache ───────────────────────────────────────────────────────────
//
// The live view only changes when a new hand is registered (or the session is
// closed). The client polls every 10s, so recomputing the whole payload on
// every poll burns dozens of queries for identical data.
//
// The payload is therefore memoized per session and invalidated by a cheap
// "version" probe (hand count + seated players + last insight timestamp). The
// probe is a single round trip; when the version is unchanged the cached
// payload is returned without touching the heavy tables.
//
// The cache lives in the module scope, so it is per serverless instance: a
// cold instance recomputes once per version instead of once per poll. The
// profile cache below (same lifetime) keeps that recompute cheap.
type LivePayload = Record<string, unknown>;

type CacheEntry = {
  version: string;
  etag: string;
  payload: LivePayload;
};

const liveCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 4;

function storeInCache(sessionId: string, version: string, payload: LivePayload): CacheEntry {
  const entry: CacheEntry = { version, etag: `"live-${version}"`, payload };
  // Refresh insertion order (LRU-ish: the oldest key is evicted first).
  liveCache.delete(sessionId);
  liveCache.set(sessionId, entry);
  while (liveCache.size > MAX_CACHE_ENTRIES) {
    const oldest = liveCache.keys().next().value;
    if (oldest === undefined) break;
    liveCache.delete(oldest);
  }
  return entry;
}

/**
 * GET /api/poker/live
 * Returns data for the live view:
 * - The session marked as is_live=true
 * - Ranking: hands won per player this session
 * - Latest 5 insights
 * - isLive flag (if false, /live page stops polling)
 */
export async function GET(request: Request) {
  try {
    // Find the live session
    const [liveSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.isLive, true))
      .limit(1);

    if (!liveSession) {
      return NextResponse.json({ isLive: false, session: null, ranking: [], insights: [] });
    }

    // ─── Version probe (one round trip) ─────────────────────────────────────
    //
    // Everything the payload depends on that can change without a new hand:
    // the number of hands, the seated players and the latest insight row
    // (insights are generated asynchronously right after a hand is posted).
    //
    // Timestamps come back as epoch seconds (double precision) so the driver
    // never has to guess how to map a raw timestamptz.
    const [probe] = await db
      .select({
        handCount: sql<number>`(SELECT count(*)::int FROM ${hands} WHERE ${hands.sessionId} = ${liveSession.id})`,
        seatedCount: sql<number>`(SELECT count(*)::int FROM ${sessionPlayers} WHERE ${sessionPlayers.sessionId} = ${liveSession.id})`,
        insightAt: sql<number | null>`(SELECT extract(epoch FROM max(${sessionInsights.createdAt})) FROM ${sessionInsights} WHERE ${sessionInsights.sessionId} = ${liveSession.id})`.mapWith(Number),
        firstHandAt: sql<number | null>`(SELECT extract(epoch FROM ${hands.createdAt}) FROM ${hands} WHERE ${hands.sessionId} = ${liveSession.id} ORDER BY ${hands.handNumber} ASC LIMIT 1)`.mapWith(Number),
        lastHandId: sql<string | null>`(SELECT ${hands.id} FROM ${hands} WHERE ${hands.sessionId} = ${liveSession.id} ORDER BY ${hands.handNumber} DESC LIMIT 1)`,
        lastHandAt: sql<number | null>`(SELECT extract(epoch FROM ${hands.createdAt}) FROM ${hands} WHERE ${hands.sessionId} = ${liveSession.id} ORDER BY ${hands.handNumber} DESC LIMIT 1)`.mapWith(Number),
        lastDealerId: sql<string | null>`(SELECT ${hands.dealerId} FROM ${hands} WHERE ${hands.sessionId} = ${liveSession.id} ORDER BY ${hands.handNumber} DESC LIMIT 1)`,
        lastSbId: sql<string | null>`(SELECT ${hands.sbId} FROM ${hands} WHERE ${hands.sessionId} = ${liveSession.id} ORDER BY ${hands.handNumber} DESC LIMIT 1)`,
      })
      .from(sessions)
      .where(eq(sessions.id, liveSession.id));

    const handCount = probe.handCount;
    const version = [
      liveSession.id,
      handCount,
      probe.seatedCount,
      probe.insightAt ?? 0,
    ].join(":");

    // ─── Cache hit ──────────────────────────────────────────────────────────
    //
    // Nothing changed since the last poll: serve the cached payload. If the
    // client already has it (If-None-Match), answer 304 with no body.
    const cached = liveCache.get(liveSession.id);
    if (cached && cached.version === version) {
      const ifNoneMatch = request.headers.get("if-none-match");
      if (ifNoneMatch && ifNoneMatch.split(",").some((t) => t.trim() === cached.etag)) {
        return new NextResponse(null, {
          status: 304,
          headers: { ETag: cached.etag, "Cache-Control": "no-store" },
        });
      }
      return NextResponse.json(cached.payload, {
        headers: { ETag: cached.etag, "Cache-Control": "no-store" },
      });
    }

    // ─── Heavy queries (run in parallel: one round trip each) ───────────────

    const [seatRows, handPlayerRows, insightRows] = await Promise.all([
      // Seat order per player (0-based clockwise); nullable → alphabetical fallback later
      db
        .select({
          playerId: sessionPlayers.playerId,
          seatOrder: sessionPlayers.seatOrder,
          name: players.name,
          nickname: players.nickname,
          photoUrl: players.photoUrl,
        })
        .from(sessionPlayers)
        .innerJoin(players, eq(sessionPlayers.playerId, players.id))
        .where(eq(sessionPlayers.sessionId, liveSession.id)),

      // All hand_players of this session with their player info
      db
        .select({
          handId: handPlayers.handId,
          playerId: handPlayers.playerId,
          playerName: players.name,
          playerNickname: players.nickname,
          playerPhoto: players.photoUrl,
          participated: handPlayers.participated,
          won: handPlayers.won,
          wentAllIn: handPlayers.wentAllIn,
          eliminated: handPlayers.eliminated,
        })
        .from(handPlayers)
        .innerJoin(players, eq(handPlayers.playerId, players.id))
        .innerJoin(hands, eq(handPlayers.handId, hands.id))
        .where(eq(hands.sessionId, liveSession.id)),

      // Insights from the LAST hand only (most relevant)
      probe.lastHandId
        ? db
            .select({
              id: sessionInsights.id,
              emoji: sessionInsights.emoji,
              message: sessionInsights.message,
              type: sessionInsights.type,
              scope: sessionInsights.scope,
              dedupKey: sessionInsights.dedupKey,
              createdAt: sessionInsights.createdAt,
            })
            .from(sessionInsights)
            .where(eq(sessionInsights.handId, probe.lastHandId))
            .orderBy(desc(sessionInsights.createdAt))
            .limit(5)
        : Promise.resolve([]),
    ]);

    // Seated players (works even before any hand is played — used by the
    // pre-game mesa view where `ranking` is still empty).
    const seatedPlayers = seatRows.map((s) => ({
      playerId: s.playerId,
      name: s.name,
      nickname: s.nickname,
      photoUrl: s.photoUrl,
      handsWon: 0,
      handsPlayed: 0,
      handsFolded: 0,
      allIns: 0,
      isEliminated: false,
      seatOrder: s.seatOrder,
    }));

    // Aggregate the hand_players rows into the per-player ranking.
    let ranking: {
      playerId: string;
      name: string;
      nickname: string | null;
      photoUrl: string | null;
      handsWon: number;
      handsPlayed: number;
      handsFolded: number;
      allIns: number;
      isEliminated: boolean;
      seatOrder: number | null;
    }[] = [];

    // Scoreboard aggregates derived from the same rows (no extra query).
    const killMap = new Map<string, number>();
    let totalAllIns = 0;
    let totalEliminations = 0;

    if (handPlayerRows.length > 0) {
      const seatOrderMap = new Map<string, number | null>(
        seatRows.map((s) => [s.playerId, s.seatOrder])
      );

      const playerMap = new Map<
        string,
        { name: string; nickname: string | null; photoUrl: string | null; handsWon: number; handsPlayed: number; handsFolded: number; allIns: number; isEliminated: boolean }
      >();

      // Per-hand winner + elimination count, used for the kill aggregate.
      const byHand = new Map<string, { winnerId: string | null; elims: number }>();

      for (const row of handPlayerRows) {
        const existing = playerMap.get(row.playerId) || {
          name: row.playerName,
          nickname: row.playerNickname,
          photoUrl: row.playerPhoto,
          handsWon: 0,
          handsPlayed: 0,
          handsFolded: 0,
          allIns: 0,
          isEliminated: false,
        };
        if (row.participated) {
          existing.handsPlayed++;
        } else if (!existing.isEliminated) {
          existing.handsFolded++;
        }
        if (row.won) existing.handsWon++;
        if (row.wentAllIn) existing.allIns++;
        if (row.eliminated) existing.isEliminated = true;
        playerMap.set(row.playerId, existing);

        // Scoreboard aggregates (same rows)
        const h = byHand.get(row.handId) || { winnerId: null, elims: 0 };
        if (row.won) h.winnerId = row.playerId;
        if (row.eliminated) { h.elims++; totalEliminations++; }
        if (row.wentAllIn) totalAllIns++;
        byHand.set(row.handId, h);
      }

      // Kills credited to the hand winner (best-effort).
      for (const { winnerId, elims } of byHand.values()) {
        if (winnerId && elims > 0) {
          killMap.set(winnerId, (killMap.get(winnerId) || 0) + elims);
        }
      }

      ranking = [...playerMap.entries()]
        .map(([playerId, data]) => ({
          playerId,
          ...data,
          seatOrder: seatOrderMap.get(playerId) ?? null,
        }))
        .sort((a, b) => {
          if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
          return b.handsWon - a.handsWon;
        });
    }

    // Check if game is finished (only 1 alive)
    const alivePlayers = ranking.filter((r) => !r.isEliminated);
    const isFinished = alivePlayers.length === 1 && ranking.length > 1;

    // Scoreboard aggregates (killMap, totalAllIns, totalEliminations) are
    // computed above from the hand_players rows already fetched — no extra query.

    // Chip/table leader = most hands won (among alive players).
    const leader = [...alivePlayers].sort((a, b) => b.handsWon - a.handsWon)[0] || null;

    // Top killer.
    let topKiller: { playerId: string; name: string; kills: number } | null = null;
    for (const r of ranking) {
      const kills = killMap.get(r.playerId) || 0;
      if (kills > 0 && (!topKiller || kills > topKiller.kills)) {
        topKiller = { playerId: r.playerId, name: r.nickname || r.name, kills };
      }
    }

    // ─── Present-tense Dealer/SB (one hand AHEAD of the last saved hand) ─────
    // The last recorded hand's button has already rotated for the hand about to
    // be played. Show the CURRENT positions: dealer = seat to the right of the
    // last dealer (among alive players); SB = seat to the dealer's left.
    let presentDealerId: string | null = null;
    let presentSbId: string | null = null;
    if (probe.lastDealerId && alivePlayers.length >= 2) {
      presentDealerId = seatToRight(alivePlayers, probe.lastDealerId);
      presentSbId = seatToLeft(alivePlayers, presentDealerId);
    }

    // ─── Scoreboard + rolling table insights ─────────────────────────────────

    const scoreboard = {
      playersAlive: alivePlayers.length,
      playersOut: ranking.length - alivePlayers.length,
      totalPlayers: ranking.length,
      totalAllIns,
      totalEliminations,
      leader: leader
        ? {
            playerId: leader.playerId,
            name: leader.nickname || leader.name,
            handsWon: leader.handsWon,
          }
        : null,
      topKiller,
    };

    // Table-level rolling insights (computed, not persisted) so the ticker keeps
    // moving even when the last hand produced nothing interesting. The
    // historical relations (kryptonite / nemesis / streak) are loaded in batch:
    // 3 queries for the whole table, not 13 per player.
    //
    // They are best-effort: a failure must never break the live endpoint.
    const aliveIds = alivePlayers.map((p) => p.playerId);
    const relations = await loadRelations(aliveIds).catch(() => new Map());

    const tableInsights = buildTableInsights({
      ranking,
      scoreboard,
      handCount,
      aliveCount: alivePlayers.length,
      relations,
    });

    // Hand insights first (what just happened), then table insights. Drop table
    // insights whose theme is already covered by the last hand (e.g. a fold
    // streak vs the ghost), dedupe by id, and cap the rotation queue.
    const reversedHandInsights = insightRows.slice().reverse();
    const handThemes = new Set(
      reversedHandInsights
        .map((insight) => themeOfHandInsight(insight))
        .filter((theme): theme is string => theme !== null)
    );
    const relevantTableInsights = tableInsights.filter(
      (insight) => !handThemes.has(insight.theme)
    );
    const handInsights = reversedHandInsights.map(
      ({ dedupKey: _dedupKey, ...rest }) => rest
    );

    const seenIds = new Set<string>();
    const mergedInsights = [...handInsights, ...relevantTableInsights]
      .filter((insight) => {
        if (seenIds.has(insight.id)) return false;
        seenIds.add(insight.id);
        return true;
      })
      .slice(0, 7);

    const payload = {
      isLive: true,
      isFinished,
      winner: isFinished ? alivePlayers[0] : null,
      session: {
        id: liveSession.id,
        playedAt: liveSession.playedAt,
        playerCount: liveSession.playerCount,
        handCount,
        startedAt: new Date(
          (probe.firstHandAt ?? liveSession.createdAt.getTime() / 1000) * 1000
        ).toISOString(),
        lastHandAt:
          probe.lastHandAt !== null && probe.lastHandAt !== undefined
            ? new Date(probe.lastHandAt * 1000).toISOString()
            : null,
        // Present-tense button positions: rotated one hand ahead of the last
        // saved hand, so the live table reflects the hand about to be played.
        dealerId: presentDealerId,
        sbId: presentSbId,
        // Heads-up mode drives blinds shown once down to 2 players.
        headsUpMode: liveSession.headsUpMode,
      },
      scoreboard,
      ranking,
      seatedPlayers,
      insights: mergedInsights,
    };

    const entry = storeInCache(liveSession.id, version, payload);

    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch.split(",").some((t) => t.trim() === entry.etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: entry.etag, "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json(payload, {
      headers: { ETag: entry.etag, "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error fetching live data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
