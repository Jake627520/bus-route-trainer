-- CreateTable
CREATE TABLE "auth_rate_limit" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "auth_rate_limit_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateIndex
CREATE INDEX "auth_rate_limit_window_start_idx" ON "auth_rate_limit"("window_start");
