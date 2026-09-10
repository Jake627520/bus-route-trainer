-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "RecallMode" AS ENUM ('NEXT_STOP_FORWARD', 'STOP_NAME_RECOGNITION');

-- CreateEnum
CREATE TYPE "RecallOutcome" AS ENUM ('PASS', 'FAIL');

-- CreateTable
CREATE TABLE "recall_session" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "targetVariantKey" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentPromptIndex" INTEGER NOT NULL DEFAULT 0,
    "currentCardKey" TEXT,
    "currentRecallMode" "RecallMode",
    "currentExpectedAnswer" TEXT,
    "currentPromptStartedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),

    CONSTRAINT "recall_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recall_attempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "promptIndex" INTEGER NOT NULL,
    "cardKey" TEXT NOT NULL,
    "recallMode" "RecallMode" NOT NULL,
    "rawInput" TEXT NOT NULL,
    "expectedAnswer" TEXT NOT NULL,
    "outcome" "RecallOutcome" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "recall_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recall_session_driverId_status_idx" ON "recall_session"("driverId", "status");

-- CreateIndex
CREATE INDEX "recall_session_driverId_targetVariantKey_idx" ON "recall_session"("driverId", "targetVariantKey");

-- CreatePartialUniqueIndex (Active session invariant)
CREATE UNIQUE INDEX "uidx_recall_session_active" ON "recall_session"("driverId", "targetVariantKey") WHERE "status" = 'IN_PROGRESS';

-- CreateIndex
CREATE INDEX "recall_attempt_sessionId_idx" ON "recall_attempt"("sessionId");

-- CreateIndex
CREATE INDEX "recall_attempt_cardKey_idx" ON "recall_attempt"("cardKey");

-- CreateIndex
CREATE UNIQUE INDEX "recall_attempt_sessionId_promptIndex_key" ON "recall_attempt"("sessionId", "promptIndex");

-- AddForeignKey
ALTER TABLE "recall_attempt" ADD CONSTRAINT "recall_attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "recall_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
