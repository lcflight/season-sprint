import { z } from "zod";

/** POST /me/api-keys body. */
export const CreateApiKeyInputSchema = z.object({
  name: z.string().min(1, "name is required").max(64, "name must be 64 characters or fewer"),
});
export type CreateApiKeyInput = z.infer<typeof CreateApiKeyInputSchema>;

/** Wire shape of an API key as returned by GET/POST /me/api-keys (POST also includes the raw `key` once). */
export const ApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  createdAt: z.string(),
});
export type ApiKeyDto = z.infer<typeof ApiKeySchema>;
