-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'MASTERED');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('STOP', 'NEXT_STOP');

-- CreateEnum
CREATE TYPE "CardState" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'MASTERED');

-- CreateTable
CREATE TABLE "driver_variant_progress" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "directionId" INTEGER NOT NULL,
    "targetVariantKey" TEXT NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStudiedAt" TIMESTAMP(3),

    CONSTRAINT "driver_variant_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_card" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "cardKey" TEXT NOT NULL,
    "cardType" "CardType" NOT NULL,
    "state" "CardState" NOT NULL DEFAULT 'NEW',
    "nextReviewAt" TIMESTAMP(3),
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "learning_card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_variant_progress_driverId_routeId_idx" ON "driver_variant_progress"("driverId", "routeId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_variant_progress_driverId_targetVariantKey_key" ON "driver_variant_progress"("driverId", "targetVariantKey");

-- CreateIndex
CREATE INDEX "learning_card_progressId_cardType_idx" ON "learning_card"("progressId", "cardType");

-- CreateIndex
CREATE UNIQUE INDEX "learning_card_progressId_cardKey_key" ON "learning_card"("progressId", "cardKey");

-- AddForeignKey
ALTER TABLE "learning_card" ADD CONSTRAINT "learning_card_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "driver_variant_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
