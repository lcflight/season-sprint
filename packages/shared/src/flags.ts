import { z } from "zod";

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
