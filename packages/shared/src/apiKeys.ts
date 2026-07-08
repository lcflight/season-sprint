import { z } from "zod";

/** POST /me/api-keys body. */
export const CreateApiKeyInputSchema = z.object({
  name: z.string().min(1, "name is required").max(64, "name must be 64 characters or fewer"),
});
export type CreateApiKeyInput = z.infer<typeof CreateApiKeyInputSchema>;
