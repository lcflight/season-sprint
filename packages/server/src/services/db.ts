import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../generated/prisma";

export class DbService {
  private prisma: PrismaClient;

  constructor(d1: D1Database) {
    this.prisma = new PrismaClient({
      adapter: new PrismaD1(d1),
    });
  }

  private async getOrCreateUserByClerkId(
    clerkUserId: string,
    userEmail: string
  ) {
    // Ensure there is a User row for the authenticated (Clerk) user id.
    // Email is required; use a deterministic placeholder in dev if unknown.
    const placeholderEmail = `${clerkUserId}@dev.local`;

    const user = await this.prisma.user.upsert({
      where: { clerkUserId },
      update: {},
      create: { clerkUserId, email: placeholderEmail },
    });

    return user;
  }

  async getUserRecords(clerkUserId: string) {
    const user = await this.getOrCreateUserByClerkId(clerkUserId);

    return this.prisma.record.findMany({
      where: { userId: user.id },
      select: {
        date: true,
        winPoints: true,
      },
      orderBy: {
        date: "desc",
      },
    });
  }

  async createRecord(
    clerkUserId: string,
    userEmail: string,
    date: Date,
    winPoints: number
  ) {
    console.log("Creating record for user", clerkUserId);
    console.log("Date:", date);
    console.log("Win Points:", winPoints);

    const user = await this.getOrCreateUserByClerkId(clerkUserId, userEmail);

    await this.prisma.record.create({
      data: {
        userId: user.id,
        date: new Date(date),
        winPoints,
      },
    });
  }
}
