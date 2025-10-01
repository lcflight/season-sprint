import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient, Record } from "../generated/prisma";

export class DbService {
  private prisma: PrismaClient;

  constructor(d1: D1Database) {
    this.prisma = new PrismaClient({
      adapter: new PrismaD1(d1),
    });
  }

  async getUserRecords(userId: string) {
    return this.prisma.record.findMany({
      where: { userId: userId },
      select: {
        date: true,
        winPoints: true,
      },
      orderBy: {
        date: "desc",
      },
    });
  }

  async createRecord(userId: string, date: Date, winPoints: number) {
    console.log("Creating record for user", userId);
    console.log("Date:", date);
    console.log("Win Points:", winPoints);

    await this.prisma.record.create({
      data: {
        userId,
        date,
        winPoints,
      },
    });
  }
}
