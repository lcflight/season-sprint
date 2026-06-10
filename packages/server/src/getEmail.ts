import { clerkClient } from "@clerk/clerk-sdk-node";

export default async function getEmail(
  userId: string,
  env: { DEV_USER_ID?: string },
  cachedEmail?: string
): Promise<string> {
  // If email was already resolved (e.g. via API key auth), use it directly
  if (cachedEmail) {
    return cachedEmail;
  }

  // In dev bypass mode, synthesize an email. Avoids relying on Node globals.
  if (env.DEV_USER_ID && userId === env.DEV_USER_ID) {
    return `${userId}@dev.local`;
  }

  // @clerk/clerk-sdk-node is a Node SDK and is fragile inside Cloudflare
  // Workers (V8 isolates, no Node runtime). It can throw at runtime — for
  // example if a tester's User row has no cached email, we end up here, and
  // an unhandled throw becomes a generic 500 with no body. Catch and fall
  // back to a synthesized email so the caller's upsert path keeps working.
  try {
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses[0]?.emailAddress ?? `${userId}@unknown.local`;
  } catch (err) {
    console.warn(
      `[getEmail] Clerk lookup failed for userId=${userId}, falling back to synthesized email:`,
      err
    );
    return `${userId}@unknown.local`;
  }
}
