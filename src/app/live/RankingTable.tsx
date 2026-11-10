"use client";

import { normalizePhotoUrl } from "@/lib/photo";
import { HEADER_LABEL } from "./live-ui";

type RankingEntry = {
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
};

// Fluid sizes so one layout works on a laptop and on a 4K TV.
const GRID_COLS =
  "grid-cols-[auto_1fr_clamp(4rem,5vw,7rem)_clamp(4rem,5vw,7rem)_clamp(4rem,5vw,7rem)]";
const HEADER_COLS =
  "grid-cols-[1fr_clamp(4rem,5vw,7rem)_clamp(4rem,5vw,7rem)_clamp(4rem,5vw,7rem)]";
const NAME_TEXT = "text-[clamp(2.25rem,3vw,7rem)] leading-none";
const STAT_TEXT = "text-[clamp(2rem,2.6vw,5rem)] leading-none";
// The photo box is square and always fills the row height, so few-player rows
// don't leave vertical gaps around the portrait and compact rows stay edge to edge.
const PHOTO_FRAME = "flex self-stretch items-center overflow-hidden";
const PHOTO_BOX = "h-full aspect-square overflow-hidden";
// Stacked rows keep the portrait square: side is the row height, capped at 60%
// of the card width. Name/score sit centered in the space left of the portrait.
const STACKED_ROW =
  "relative flex flex-1 items-center [container-type:size] overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-b from-gray-950 to-black bg-gray-900/70";
const STACKED_PHOTO_FRAME = "flex h-full shrink-0 items-center overflow-hidden";
const STACKED_PHOTO_BOX = "aspect-square w-[min(100cqh,60cqw)] overflow-hidden";
const BADGE_NUMBER = "text-[clamp(1.75rem,2.2vw,4rem)]";

/**
 * Phase 3 ranking table. Shows the accumulated stats players can't see at a
 * glance on the physical table: wins, folds, all-ins. Alive players are ranked
 * by wins; eliminated players collapse into a compact strikethrough row so
 * everyone still fits on screen alongside the news ticker.
 */
export default function RankingTable({ players }: { players: RankingEntry[] }) {
  const displayName = (p: RankingEntry) => p.nickname || p.name;

  const alive = players
    .filter((p) => !p.isEliminated)
    .sort((a, b) => b.handsWon - a.handsWon || b.handsPlayed - a.handsPlayed);
  const eliminated = players.filter((p) => p.isEliminated);
  // With a short field the rows get very tall. Stack name over stats so the
  // wide portrait can't squeeze the name / third-place row out of the grid.
  const stacked = alive.length <= 3;

  return (
    <div className="flex h-full flex-col">

      {/* Alive players — flexible rows */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {alive.map((p, i) => {
          const photo = normalizePhotoUrl(p.photoUrl);
          const stats = (
            <>
              <span
                className={`text-center font-black tabular-nums ${STAT_TEXT} ${
                  p.allIns > 0 ? "text-orange-400" : "text-gray-700"
                }`}
              >
                {p.allIns}
              </span>
              <span className={`text-center font-black tabular-nums text-gray-400 ${STAT_TEXT}`}>
                {p.handsFolded}
              </span>
              <span className={`text-center font-black tabular-nums text-emerald-400 ${STAT_TEXT}`}>
                {p.handsWon}
              </span>
            </>
          );
          const portrait = (frame: string) => (
            <div className={`${frame} bg-black/20`}>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt={displayName(p)}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  className={`flex h-full w-full items-center justify-center font-black ${BADGE_NUMBER} ${
                    i === 0
                      ? "bg-yellow-400 text-black"
                      : i === 1
                      ? "bg-gray-300 text-black"
                      : i === 2
                      ? "bg-amber-700 text-white"
                      : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {i + 1}
                </span>
              )}
            </div>
          );
          const nameNode = (
            <span className={`truncate font-black ${NAME_TEXT}`}>{displayName(p)}</span>
          );
          const stackedNameNode = (
            <span
              className={`max-w-[clamp(8rem,11vw,18rem)] truncate font-black ${NAME_TEXT}`}
            >
              {displayName(p)}
            </span>
          );
          return (
          <div
            key={p.playerId}
            className={
              stacked
                ? STACKED_ROW
                : `grid flex-1 ${GRID_COLS} items-center gap-2 overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-b from-gray-950 to-black bg-gray-900/70 pr-4`
            }
          >
            {stacked ? (
              <>
                {/* Full-height square portrait; name/score centered in the rest */}
                <div className={STACKED_PHOTO_FRAME}>{portrait(STACKED_PHOTO_BOX)}</div>
                <div className="flex min-w-0 flex-1 items-center justify-center">
                  <div className="flex min-w-0 max-w-full flex-col items-start gap-3 px-4">
                    {stackedNameNode}
                    <div className="flex items-center gap-[clamp(1.5rem,3vw,4rem)]">{stats}</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Photo (falls back to rank number when the player has no photo) */}
                <div className={PHOTO_FRAME}>{portrait(PHOTO_BOX)}</div>

                {/* Name */}
                {nameNode}

                {/* Stats */}
                {stats}
              </>
            )}
          </div>
          );
        })}
      </div>

      {/* Eliminated — compact strip */}
      {/* {eliminated.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-800/70 px-4 pt-2">
          <span className="text-xs font-black uppercase tracking-widest text-gray-700">
            Fuera
          </span>
          {eliminated.map((p) => (
            <span key={p.playerId} className="text-base font-bold text-gray-600 line-through">
              {displayName(p)}
            </span>
          ))}
        </div>
      )} */}
    </div>
  );
}
