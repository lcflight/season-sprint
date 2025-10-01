import { clerkClient } from "@clerk/clerk-sdk-node";

export default async function getEmail(userId: string): Promise<string> {
  if (!process.env.DEV_USER_ID) {
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses[0].emailAddress;
  } else {
    return `${userId}@dev.local`;
  }
}
