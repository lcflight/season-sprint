import { z } from "zod";
import { GameModeSchema } from "./gameMode";

/** Date-only wire format used everywhere records are sent, e.g. "2026-03-01". */
const DateStringSchema = z.string().date();

/** POST /me/records body. `mode` is optional on the wire — older clients omit it and it defaults to "world-tour". */
export const CreateRecordInputSchema = z.object({
  date: DateStringSchema,
  winPoints: z.number(),
  mode: GameModeSchema.optional(),
});
export type CreateRecordInput = z.infer<typeof CreateRecordInputSchema>;

/** PUT /me/records/:id body. Both fields optional — caller must send at least one. */
export const UpdateRecordInputSchema = z.object({
  date: DateStringSchema.optional(),
  winPoints: z.number().optional(),
});
export type UpdateRecordInput = z.infer<typeof UpdateRecordInputSchema>;

/** POST /me/records/bulk body. */
export const BulkUpsertInputSchema = z.object({
  records: z.array(
    z.object({
      date: DateStringSchema,
      winPoints: z.number(),
    })
  ),
  mode: GameModeSchema.optional(),
});
export type BulkUpsertInput = z.infer<typeof BulkUpsertInputSchema>;
