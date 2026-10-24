// Shared types for the session "Dominio de la Mesa" stacked chart.
// Keep in one place so the recap API, the dashboard recap page and the live
// winner slider never drift apart.

export type ChartEventType =
  | "allin_win"
  | "allin_survive"
  | "elimination"
  | "strong_hand"
  | "leader_change";

export type ChartEvent = {
  handNumber: number;
  playerId: string;
  playerName: string;
  type: ChartEventType;
  emoji: string;
  label: string;
};

export type ChartPlayer = {
  id: string;
  name: string;
  color: string;
  finishPosition: number | null;
};

export type DominionPoint = {
  handNumber: number;
  values: Record<string, number>;
};
