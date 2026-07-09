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

  async getUserRecords(clerkUserId: string, mode = "world-tour") {
    return await this.prisma.record.findMany({
      where: {
        mode,
        User: {
          clerkUserId,
        },
      },
      select: {
        id: true,
        date: true,
        winPoints: true,
        mode: true,
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
    winPoints: number,
    mode = "world-tour"
  ) {
    const user = await this.getOrCreateUserByClerkId(clerkUserId, userEmail);

    await this.prisma.record.create({
      data: {
        userId: user.id,
        date: new Date(date),
        winPoints,
        mode,
      },
    });
  }

  async upsertRecord(
    clerkUserId: string,
    userEmail: string,
    date: Date,
    winPoints: number,
    mode = "world-tour"
  ) {
    const user = await this.getOrCreateUserByClerkId(clerkUserId, userEmail);

    // Normalize the date to start of day for consistent matching
    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    // Find existing record for this user, mode, and date
    const existing = await this.prisma.record.findFirst({
      where: {
        userId: user.id,
        mode,
        date: normalizedDate,
      },
    });

    if (existing) {
      // Update existing record
      return await this.prisma.record.update({
        where: { id: existing.id },
        data: { winPoints },
        select: { id: true, date: true, winPoints: true, mode: true },
      });
    } else {
      // Create new record
      return await this.prisma.record.create({
        data: {
          userId: user.id,
          date: normalizedDate,
          winPoints,
          mode,
        },
        select: { id: true, date: true, winPoints: true, mode: true },
      });
    }
  }

  // Returns the deleted record's mode so callers can scope the live broadcast.
  async deleteRecordIfOwner(
    clerkUserId: string,
    recordId: string
  ): Promise<{ mode: string } | null> {
    const existing = await this.prisma.record.findFirst({
      where: {
        id: recordId,
        User: { clerkUserId },
      },
      select: { id: true, mode: true },
    });

    if (!existing) {
      return null;
    }

    await this.prisma.record.delete({ where: { id: recordId } });
    return { mode: existing.mode };
  }

  async deleteAllUserRecords(
    clerkUserId: string,
    mode = "world-tour"
  ): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true },
    });

    if (!user) {
      return 0;
    }

    const result = await this.prisma.record.deleteMany({
      where: { userId: user.id, mode },
    });

    return result.count;
  }

  async bulkUpsertRecords(
    clerkUserId: string,
    userEmail: string,
    records: { date: Date; winPoints: number }[],
    mode = "world-tour"
  ) {
    if (records.length === 0) return [];

    const user = await this.getOrCreateUserByClerkId(clerkUserId, userEmail);
    const results = [];

    for (const { date, winPoints } of records) {
      const normalizedDate = new Date(date);
      normalizedDate.setUTCHours(0, 0, 0, 0);

      const existing = await this.prisma.record.findFirst({
        where: { userId: user.id, mode, date: normalizedDate },
      });

      if (existing) {
        const updated = await this.prisma.record.update({
          where: { id: existing.id },
          data: { winPoints },
          select: { id: true, date: true, winPoints: true, mode: true },
        });
        results.push(updated);
      } else {
        const created = await this.prisma.record.create({
          data: { userId: user.id, date: normalizedDate, winPoints, mode },
          select: { id: true, date: true, winPoints: true, mode: true },
        });
        results.push(created);
      }
    }

    return results;
  }

  // ── API Keys ──────────────────────────────────────────────────────────────

  async getUserByApiKeyHash(
    keyHash: string
  ): Promise<{ clerkUserId: string; email: string } | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        revokedAt: true,
        User: { select: { clerkUserId: true, email: true } },
      },
    });

    if (!apiKey || apiKey.revokedAt) return null;
    return { clerkUserId: apiKey.User.clerkUserId, email: apiKey.User.email };
  }

  async createApiKey(
    clerkUserId: string,
    email: string,
    name: string,
    keyHash: string,
    keyPrefix: string
  ) {
    const user = await this.getOrCreateUserByClerkId(clerkUserId, email);
    return await this.prisma.apiKey.create({
      data: { name, keyHash, keyPrefix, userId: user.id },
      select: { id: true, name: true, keyPrefix: true, createdAt: true },
    });
  }

  async listApiKeys(clerkUserId: string) {
    return await this.prisma.apiKey.findMany({
      where: {
        User: { clerkUserId },
        revokedAt: null,
      },
      select: { id: true, name: true, keyPrefix: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeApiKey(
    clerkUserId: string,
    keyId: string
  ): Promise<boolean> {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id: keyId, User: { clerkUserId }, revokedAt: null },
      select: { id: true },
    });

    if (!existing) return false;

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
    return true;
  }

  // ── Records ───────────────────────────────────────────────────────────────

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
      select: { id: true, date: true, winPoints: true, mode: true },
    });
  }

  // ── Feature flags ─────────────────────────────────────────────────────────

  /** Resolve every flag for a user: per-user override wins over the global default. */
  async getResolvedFlags(clerkUserId: string): Promise<Record<string, boolean>> {
    const flags = await this.prisma.featureFlag.findMany({
      select: { key: true, enabledGlobally: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true },
    });

    const overrides = user
      ? await this.prisma.userFlagOverride.findMany({
          where: { userId: user.id },
          select: { flagKey: true, enabled: true },
        })
      : [];
    const overrideMap = new Map(overrides.map((o) => [o.flagKey, o.enabled]));

    const resolved: Record<string, boolean> = {};
    for (const flag of flags) {
      resolved[flag.key] = overrideMap.has(flag.key)
        ? Boolean(overrideMap.get(flag.key))
        : flag.enabledGlobally;
    }
    return resolved;
  }

  async isUserAdmin(clerkUserId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: { isAdmin: true },
    });
    return Boolean(user?.isAdmin);
  }

  async listFlags() {
    return await this.prisma.featureFlag.findMany({
      select: { key: true, description: true, enabledGlobally: true },
      orderBy: { key: "asc" },
    });
  }

  async createFlag(key: string, description: string) {
    return await this.prisma.featureFlag.upsert({
      where: { key },
      update: { description },
      create: { key, description },
      select: { key: true, description: true, enabledGlobally: true },
    });
  }

  async setFlagGlobal(key: string, enabledGlobally: boolean) {
    return await this.prisma.featureFlag.update({
      where: { key },
      data: { enabledGlobally },
      select: { key: true, description: true, enabledGlobally: true },
    });
  }

  /** Look up users by an email substring, including their per-flag overrides. */
  async searchUsersByEmail(query: string) {
    return await this.prisma.user.findMany({
      where: { email: { contains: query } },
      select: {
        id: true,
        clerkUserId: true,
        email: true,
        isAdmin: true,
        flagOverrides: { select: { flagKey: true, enabled: true } },
      },
      orderBy: { email: "asc" },
      take: 25,
    });
  }

  async setUserOverride(userId: string, flagKey: string, enabled: boolean) {
    return await this.prisma.userFlagOverride.upsert({
      where: { userId_flagKey: { userId, flagKey } },
      update: { enabled },
      create: { userId, flagKey, enabled },
      select: { userId: true, flagKey: true, enabled: true },
    });
  }

  async clearUserOverride(userId: string, flagKey: string): Promise<boolean> {
    const result = await this.prisma.userFlagOverride.deleteMany({
      where: { userId, flagKey },
    });
    return result.count > 0;
  }

  async setUserAdmin(userId: string, isAdmin: boolean) {
    return await this.prisma.user.update({
      where: { id: userId },
      data: { isAdmin },
      select: { id: true, email: true, isAdmin: true },
    });
  }

  // ── Deletion requests ────────────────────────────────────────────────────

  async createDeletionRequest(email: string, reason?: string) {
    return await this.prisma.deletionRequest.create({
      data: { email, reason },
      select: { id: true, email: true, reason: true, createdAt: true },
    });
  }

  async listDeletionRequests() {
    return await this.prisma.deletionRequest.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async dismissDeletionRequest(id: string): Promise<boolean> {
    const result = await this.prisma.deletionRequest.deleteMany({
      where: { id },
    });
    return result.count > 0;
  }
}
