/**
 * Fixed seat layout for the real (rectangular) poker table.
 *
 * 10 seats, numbered clockwise starting at the top-left corner:
 *
 *        a0        a1   a2        a3
 *         ┌───────────────────────┐
 *      a9 │                       │ a4   ← a4 = 3 o'clock (right short side)
 *         └───────────────────────┘
 *        a8        a6   a7        a5
 *
 *  a0 — top-left corner
 *  a1, a2 — top long side
 *  a3 — top-right corner
 *  a4 — right short side (3 o'clock)
 *  a5 — bottom-right corner
 *  a6, a7 — bottom long side
 *  a8 — bottom-left corner
 *  a9 — left short side (9 o'clock)
 *
 * Coordinates are percentages relative to the table container box.
 */
export const TABLE_SEATS: { seat: number; left: number; top: number }[] = [
  { seat: 0, left: 14, top: 10 }, // top-left corner
  { seat: 1, left: 38, top: 4 },  // top long side (left)
  { seat: 2, left: 62, top: 4 },  // top long side (right)
  { seat: 3, left: 86, top: 10 }, // top-right corner
  { seat: 4, left: 95, top: 50 }, // right short side (3 o'clock)
  { seat: 5, left: 86, top: 90 }, // bottom-right corner
  { seat: 6, left: 62, top: 96 }, // bottom long side (right)
  { seat: 7, left: 38, top: 96 }, // bottom long side (left)
  { seat: 8, left: 14, top: 90 }, // bottom-left corner
  { seat: 9, left: 5, top: 50 },  // left short side (9 o'clock)
];

export const SEAT_COUNT = TABLE_SEATS.length;
