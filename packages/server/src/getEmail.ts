import { clerkClient } from "@clerk/clerk-sdk-node";
import { constants } from "./index";

export default async function getEmail(userId: string): Promise<string> {
  if (constants.DEV_USER_ID === undefined) {
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses[0].emailAddress;
  } else {
    return `${userId}@dev.local`;
  }
}
