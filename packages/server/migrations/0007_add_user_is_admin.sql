-- AddColumn
-- Marks a user as an admin (can manage feature flags via the admin panel).
ALTER TABLE "User" ADD COLUMN "isAdmin" INTEGER NOT NULL DEFAULT 0;
