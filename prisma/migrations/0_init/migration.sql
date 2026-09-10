-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "GtfsAgency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,

    CONSTRAINT "GtfsAgency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsRoute" (
    "id" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "longName" TEXT NOT NULL,
    "routeType" INTEGER NOT NULL,

    CONSTRAINT "GtfsRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsTrip" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "directionId" INTEGER NOT NULL DEFAULT 0,
    "tripHeadsign" TEXT,
    "shapeId" TEXT,

    CONSTRAINT "GtfsTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsStop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GtfsStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsStopTime" (
    "tripId" TEXT NOT NULL,
    "stopSequence" INTEGER NOT NULL,
    "stopId" TEXT NOT NULL,
    "arrivalTime" TEXT,
    "departureTime" TEXT,
    "isTimepoint" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GtfsStopTime_pkey" PRIMARY KEY ("tripId","stopSequence")
);

-- CreateTable
CREATE TABLE "GtfsCalendar" (
    "serviceId" TEXT NOT NULL,
    "monday" BOOLEAN NOT NULL,
    "tuesday" BOOLEAN NOT NULL,
    "wednesday" BOOLEAN NOT NULL,
    "thursday" BOOLEAN NOT NULL,
    "friday" BOOLEAN NOT NULL,
    "saturday" BOOLEAN NOT NULL,
    "sunday" BOOLEAN NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,

    CONSTRAINT "GtfsCalendar_pkey" PRIMARY KEY ("serviceId")
);

-- CreateTable
CREATE TABLE "GtfsCalendarDate" (
    "serviceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "exceptionType" INTEGER NOT NULL,

    CONSTRAINT "GtfsCalendarDate_pkey" PRIMARY KEY ("serviceId","date")
);

-- CreateTable
CREATE TABLE "DriverNote" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL DEFAULT 'default-driver',
    "stopId" TEXT,
    "routeId" TEXT,
    "noteText" TEXT NOT NULL,
    "hazardLevel" TEXT NOT NULL DEFAULT 'INFO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GtfsTrip_routeId_directionId_idx" ON "GtfsTrip"("routeId", "directionId");

-- CreateIndex
CREATE INDEX "GtfsTrip_serviceId_idx" ON "GtfsTrip"("serviceId");

-- CreateIndex
CREATE INDEX "GtfsStopTime_stopId_idx" ON "GtfsStopTime"("stopId");

-- CreateIndex
CREATE INDEX "GtfsCalendarDate_serviceId_idx" ON "GtfsCalendarDate"("serviceId");

-- CreateIndex
CREATE INDEX "DriverNote_driverId_idx" ON "DriverNote"("driverId");

-- CreateIndex
CREATE INDEX "DriverNote_stopId_idx" ON "DriverNote"("stopId");

-- CreateIndex
CREATE INDEX "DriverNote_routeId_idx" ON "DriverNote"("routeId");

-- AddForeignKey
ALTER TABLE "GtfsTrip" ADD CONSTRAINT "GtfsTrip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "GtfsRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsStopTime" ADD CONSTRAINT "GtfsStopTime_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "GtfsTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsStopTime" ADD CONSTRAINT "GtfsStopTime_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "GtfsStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
