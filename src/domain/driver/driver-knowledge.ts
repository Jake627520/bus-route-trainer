/**
 * Driver Knowledge Layer (Interfaces & Minimal Domain Boundary)
 *
 * Strictly separated from GTFS Official Transport Data.
 * Stores personal driver memory aids, landmarks, depot pointers, and caution hazards.
 * Does NOT implement the SRS scheduling algorithm (deferred to Change 08).
 */

export enum HazardLevel {
  INFO = 'INFO',
  CAUTION = 'CAUTION',
  DANGER = 'DANGER',
}

export interface DriverNote {
  id: string;
  driverId: string;
  stopId?: string | null;
  routeId?: string | null;
  noteText: string;
  hazardLevel: HazardLevel;
  createdAt: Date;
  updatedAt: Date;
}

export interface HazardAlert {
  id: string;
  driverId: string;
  stopId?: string | null;
  routeId?: string | null;
  title: string;
  description: string;
  hazardLevel: HazardLevel;
}
