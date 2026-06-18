-- AddColumn
-- Discriminates which game mode a record belongs to ("world-tour" | "ranked").
-- Existing rows backfill to "world-tour" via the default, preserving current data.
ALTER TABLE "Record" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'world-tour';

-- CreateIndex
-- One record per (user, mode, day). UNIQUE both supports the upsert lookup and
-- prevents duplicate rows if two writes for the same day race each other.
CREATE UNIQUE INDEX "Record_userId_mode_date_key" ON "Record"("userId", "mode", "date");
