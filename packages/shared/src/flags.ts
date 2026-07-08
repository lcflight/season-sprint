import { z } from "zod";

/** Wire shape of a feature flag as returned by GET /admin/flags. */
export const FlagSchema = z.object({
  key: z.string(),
  description: z.string(),
  enabledGlobally: z.boolean(),
});
export type FlagDto = z.infer<typeof FlagSchema>;

/** POST /admin/flags body. */
export const CreateFlagInputSchema = z.object({
  key: z.string().min(1, "Missing flag key"),
  description: z.string().optional(),
});
export type CreateFlagInput = z.infer<typeof CreateFlagInputSchema>;

/** PATCH /admin/flags/:key body. */
export const ToggleFlagInputSchema = z.object({
  enabledGlobally: z.boolean(),
});
export type ToggleFlagInput = z.infer<typeof ToggleFlagInputSchema>;

/** GET /me/flags response. */
export const ResolvedFlagsResponseSchema = z.object({
  flags: z.record(z.string(), z.boolean()),
  isAdmin: z.boolean(),
});
export type ResolvedFlagsResponse = z.infer<typeof ResolvedFlagsResponseSchema>;
