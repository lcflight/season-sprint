import { z } from "zod";

/** POST /deletion-requests body. Public endpoint — no auth required. */
export const CreateDeletionRequestInputSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  reason: z.string().max(1000).optional(),
});
export type CreateDeletionRequestInput = z.infer<
  typeof CreateDeletionRequestInputSchema
>;
