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
        id: true,
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

  async upsertRecord(
    clerkUserId: string,
    userEmail: string,
    date: Date,
    winPoints: number
  ) {
    console.log("Upserting record for user", clerkUserId);
    console.log("Date:", date);
    console.log("Win Points:", winPoints);

    const user = await this.getOrCreateUserByClerkId(clerkUserId, userEmail);

    // Normalize the date to start of day for consistent matching
    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    // Find existing record for this user and date
    const existing = await this.prisma.record.findFirst({
      where: {
        userId: user.id,
        date: normalizedDate,
      },
    });

    if (existing) {
      // Update existing record
      return await this.prisma.record.update({
        where: { id: existing.id },
        data: { winPoints },
        select: { id: true, date: true, winPoints: true },
      });
    } else {
      // Create new record
      return await this.prisma.record.create({
        data: {
          userId: user.id,
          date: normalizedDate,
          winPoints,
        },
        select: { id: true, date: true, winPoints: true },
      });
    }
  }

  async updateRecordIfOwner(
    clerkUserId: string,
    recordId: string,
    updates: { date?: Date; winPoints?: number }
  ) {
    // Verify ownership by joining to the related User via clerkUserId
    const existing = await this.prisma.record.findFirst({
      where: {
        id: recordId,
        User: { clerkUserId },
      },
      select: { id: true },
    });

    if (!existing) {
      return null;
    }

    const data: { date?: Date; winPoints?: number } = {};
    if (updates.date instanceof Date) {
      data.date = updates.date;
    }
    if (typeof updates.winPoints === "number") {
      data.winPoints = updates.winPoints;
    }

    return await this.prisma.record.update({
      where: { id: recordId },
      data,
      select: { id: true, date: true, winPoints: true },
    });
  }
}
