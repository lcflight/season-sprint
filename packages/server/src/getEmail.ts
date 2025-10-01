import { clerkClient } from "@clerk/clerk-sdk-node";

export default async function getEmail(
  userId: string,
  env: { DEV_USER_ID: string }
): Promise<string> {
  // In dev bypass mode, synthesize an email. Avoids relying on Node globals.
  if (env.DEV_USER_ID && userId === env.DEV_USER_ID) {
    return `${userId}@dev.local`;
  }

  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses[0]?.emailAddress ?? `${userId}@unknown.local`;
}
