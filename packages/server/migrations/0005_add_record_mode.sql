-- AddColumn
-- Discriminates which game mode a record belongs to ("world-tour" | "ranked").
-- Existing rows backfill to "world-tour" via the default, preserving current data.
ALTER TABLE "Record" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'world-tour';

-- CreateIndex
-- Supports the (userId, mode, date) lookup used by upsert/query/delete-all.
CREATE INDEX "Record_userId_mode_date_idx" ON "Record"("userId", "mode", "date");
