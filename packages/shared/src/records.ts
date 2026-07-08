import { z } from "zod";
import { GameModeSchema } from "./gameMode";

/** Wire shape of a Record as returned by GET /me/records. Dates are ISO strings — Date objects don't survive JSON. */
export const RecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: z.string(),
  winPoints: z.number(),
  mode: GameModeSchema,
});
export type RecordDto = z.infer<typeof RecordSchema>;

/** POST /me/records body. `mode` is optional on the wire — older clients omit it and it defaults to "world-tour". */
export const CreateRecordInputSchema = z.object({
  date: z.string(),
  winPoints: z.number(),
  mode: GameModeSchema.optional(),
});
export type CreateRecordInput = z.infer<typeof CreateRecordInputSchema>;

/** PUT /me/records/:id body. Both fields optional — caller must send at least one. */
export const UpdateRecordInputSchema = z.object({
  date: z.string().optional(),
  winPoints: z.number().optional(),
});
export type UpdateRecordInput = z.infer<typeof UpdateRecordInputSchema>;

/** POST /me/records/bulk body. */
export const BulkUpsertInputSchema = z.object({
  records: z.array(
    z.object({
      date: z.string(),
      winPoints: z.number(),
    })
  ),
  mode: GameModeSchema.optional(),
});
export type BulkUpsertInput = z.infer<typeof BulkUpsertInputSchema>;
