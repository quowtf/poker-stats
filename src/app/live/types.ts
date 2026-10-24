/**
 * Shared insight type for the live view.
 *
 * `scope` distinguishes per-hand insights (persisted, generated in
 * `lib/insights.ts`) from rolling table insights (computed on the fly in
 * `lib/live-insights.ts`). Table insights have no `createdAt`.
 */
export type InsightScope = "hand" | "table";

export type Insight = {
  id: string;
  emoji: string;
  message: string;
  type: string;
  scope?: InsightScope;
  createdAt?: string;
};
