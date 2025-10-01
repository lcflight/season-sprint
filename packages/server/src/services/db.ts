import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../generated/prisma";

export class DbService {
  private prisma: PrismaClient;

  constructor(d1: D1Database) {
    if (!d1 || typeof (d1 as any).prepare !== "function") {
      console.error("DbService: received invalid D1 binding (missing prepare)", d1);
    }
    this.prisma = new PrismaClient({
      adapter: new PrismaD1(d1),
    });
  }

  private async getOrCreateUserByClerkId(
    clerkUserId: string,
    userEmail: string
  ) {
    return await this.prisma.user.upsert({
      where: { clerkUserId },
      update: {},
      create: { clerkUserId, email: userEmail },
    });
  }

  async getUserRecords(clerkUserId: string) {
    console.warn("Getting user records for clerk user", clerkUserId);

    return await this.prisma.record.findMany({
      where: {
        User: {
          clerkUserId,
        },
      },
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
