import { z } from "zod";

/**
 * POST /me/deletion-requests body. Authenticated — the account email is
 * derived server-side from the caller's session, never taken from the
 * request body. Otherwise anyone could request deletion of someone else's
 * account just by typing their email address.
 */
export const CreateDeletionRequestInputSchema = z.object({
  reason: z.string().max(1000).optional(),
});
export type CreateDeletionRequestInput = z.infer<
  typeof CreateDeletionRequestInputSchema
>;
