-- AlterTable
ALTER TABLE "learning_card" ADD COLUMN     "srs_level" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "learning_card_progressId_nextReviewAt_idx" ON "learning_card"("progressId", "nextReviewAt");
