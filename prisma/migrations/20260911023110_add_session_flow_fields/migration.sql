-- AlterTable
ALTER TABLE "recall_attempt" ADD COLUMN     "resulting_lapses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resulting_next_review_at" TIMESTAMP(3),
ADD COLUMN     "resulting_repetitions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resulting_srs_level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resulting_state" "CardState" NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "recall_session" ADD COLUMN     "planned_card_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
