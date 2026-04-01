const PREFIX = "sk_";

/** Generate a random API key: sk_ + 64 hex chars (256 bits). */
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${PREFIX}${hex}`;
}

/** SHA-256 hash of a key, returned as lowercase hex. */
export async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** First 11 chars of the key (sk_ + 8 hex) for display. */
export function keyPrefix(key: string): string {
  return key.slice(0, 11);
}

/** Check if a string looks like an API key. */
export function isApiKey(value: string): boolean {
  return value.startsWith(PREFIX);
}
