import { z } from "zod";

export const GameModeSchema = z.enum(["world-tour", "ranked"]);
export type GameMode = z.infer<typeof GameModeSchema>;
