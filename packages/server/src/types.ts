export type GameMode = "world-tour" | "ranked";

export type Record = {
  id: string;
  userId: string;
  date: Date;
  winPoints: number;
  mode: GameMode;
};
