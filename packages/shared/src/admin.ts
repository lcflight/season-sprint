import { z } from "zod";

/** PUT /admin/users/:userId/flags/:flagKey body. */
export const SetUserOverrideInputSchema = z.object({
  enabled: z.boolean(),
});
export type SetUserOverrideInput = z.infer<typeof SetUserOverrideInputSchema>;

/** PATCH /admin/users/:userId body. */
export const SetUserAdminInputSchema = z.object({
  isAdmin: z.boolean(),
});
export type SetUserAdminInput = z.infer<typeof SetUserAdminInputSchema>;
