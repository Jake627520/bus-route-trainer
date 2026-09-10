import { z } from 'zod';

export class UnsupportedMultiAgencyFeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedMultiAgencyFeedError';
  }
}

export class DuplicateStopSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateStopSequenceError';
  }
}

export class NonMonotonicStopSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonMonotonicStopSequenceError';
  }
}

export class InvalidTimingRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTimingRuleError';
  }
}

// ---------------------------------------------------------------------------
// 1. Agency Validation & Single-Agency Profile
// ---------------------------------------------------------------------------
export interface ValidatedAgency {
  id: string;
  name: string;
  url: string;
  timezone: string;
}

export function validateAgencyRows(rows: Record<string, string>[]): ValidatedAgency {
  if (!rows || rows.length === 0) {
    throw new Error('agency.txt is required but contains no data rows');
  }

  if (rows.length > 1) {
    throw new UnsupportedMultiAgencyFeedError(
      `Feed contains ${rows.length} agencies. V1 profile strictly supports single-agency feeds only.`
    );
  }

  const row = rows[0];
  const name = row['agency_name']?.trim();
  const url = row['agency_url']?.trim();
  const timezone = row['agency_timezone']?.trim();
  const rawId = row['agency_id']?.trim();

  if (!name) throw new Error('agency_name is required in agency.txt');
  if (!timezone) throw new Error('agency_timezone is required in agency.txt');

  const id = rawId && rawId.length > 0 ? rawId : 'DEFAULT_AGENCY';

  return {
    id,
    name,
    url: url ?? '',
    timezone,
  };
}

// ---------------------------------------------------------------------------
// 2. Routes Schema
// ---------------------------------------------------------------------------
export const routeRowSchema = z
  .object({
    route_id: z.string().min(1, 'route_id must not be empty'),
    agency_id: z.string().optional(),
    route_short_name: z.string().optional(),
    route_long_name: z.string().optional(),
    route_type: z.coerce.number().int(),
  })
  .refine(
    (data) => (data.route_short_name && data.route_short_name.trim().length > 0) ||
              (data.route_long_name && data.route_long_name.trim().length > 0),
    { message: 'At least one of route_short_name or route_long_name must be non-empty' }
  )
  .transform((data) => ({
    id: data.route_id.trim(),
    agencyId: data.agency_id && data.agency_id.trim().length > 0 ? data.agency_id.trim() : null,
    shortName: data.route_short_name ? data.route_short_name.trim() : '',
    longName: data.route_long_name ? data.route_long_name.trim() : '',
    routeType: data.route_type,
  }));

// ---------------------------------------------------------------------------
// 3. Stops Schema
// ---------------------------------------------------------------------------
export const stopRowSchema = z
  .object({
    stop_id: z.string().min(1, 'stop_id must not be empty'),
    stop_name: z.string().min(1, 'stop_name must not be empty'),
    stop_lat: z.coerce.number().min(-90).max(90),
    stop_lon: z.coerce.number().min(-180).max(180),
  })
  .transform((data) => ({
    id: data.stop_id.trim(),
    name: data.stop_name.trim(),
    latitude: data.stop_lat,
    longitude: data.stop_lon,
  }));

// ---------------------------------------------------------------------------
// 4. Calendar & CalendarDates Schema
// ---------------------------------------------------------------------------
export const calendarRowSchema = z
  .object({
    service_id: z.string().min(1, 'service_id must not be empty'),
    monday: z.coerce.number().int().min(0).max(1),
    tuesday: z.coerce.number().int().min(0).max(1),
    wednesday: z.coerce.number().int().min(0).max(1),
    thursday: z.coerce.number().int().min(0).max(1),
    friday: z.coerce.number().int().min(0).max(1),
    saturday: z.coerce.number().int().min(0).max(1),
    sunday: z.coerce.number().int().min(0).max(1),
    start_date: z.string().regex(/^\d{8}$/, 'start_date must be YYYYMMDD'),
    end_date: z.string().regex(/^\d{8}$/, 'end_date must be YYYYMMDD'),
  })
  .transform((data) => ({
    serviceId: data.service_id.trim(),
    monday: data.monday === 1,
    tuesday: data.tuesday === 1,
    wednesday: data.wednesday === 1,
    thursday: data.thursday === 1,
    friday: data.friday === 1,
    saturday: data.saturday === 1,
    sunday: data.sunday === 1,
    startDate: data.start_date.trim(),
    endDate: data.end_date.trim(),
  }));

export const calendarDateRowSchema = z
  .object({
    service_id: z.string().min(1, 'service_id must not be empty'),
    date: z.string().regex(/^\d{8}$/, 'date must be YYYYMMDD'),
    exception_type: z.coerce.number().int().min(1).max(2),
  })
  .transform((data) => ({
    serviceId: data.service_id.trim(),
    date: data.date.trim(),
    exceptionType: data.exception_type,
  }));

// ---------------------------------------------------------------------------
// 5. Trips Schema
// ---------------------------------------------------------------------------
export const tripRowSchema = z
  .object({
    trip_id: z.string().min(1, 'trip_id must not be empty'),
    route_id: z.string().min(1, 'route_id must not be empty'),
    service_id: z.string().min(1, 'service_id must not be empty'),
    direction_id: z.coerce.number().int().min(0).max(1).optional().default(0),
    trip_headsign: z.string().optional(),
    shape_id: z.string().optional(),
  })
  .transform((data) => ({
    id: data.trip_id.trim(),
    routeId: data.route_id.trim(),
    serviceId: data.service_id.trim(),
    directionId: data.direction_id,
    tripHeadsign: data.trip_headsign && data.trip_headsign.trim().length > 0 ? data.trip_headsign.trim() : null,
    shapeId: data.shape_id && data.shape_id.trim().length > 0 ? data.shape_id.trim() : null,
  }));

// ---------------------------------------------------------------------------
// 6. StopTimes Schema
// ---------------------------------------------------------------------------
export const stopTimeRowSchema = z
  .object({
    trip_id: z.string().min(1, 'trip_id must not be empty'),
    stop_sequence: z.coerce.number().int().min(0, 'stop_sequence must be non-negative'),
    stop_id: z.string().min(1, 'stop_id must not be empty'),
    arrival_time: z.string().optional(),
    departure_time: z.string().optional(),
    timepoint: z.coerce.number().int().min(0).max(1).optional().default(1),
    // Deferred fields
    stop_headsign: z.string().optional(),
    pickup_type: z.coerce.number().int().optional(),
    drop_off_type: z.coerce.number().int().optional(),
    shape_dist_traveled: z.coerce.number().optional(),
  })
  .transform((data) => {
    const rawArr = data.arrival_time?.trim();
    const rawDep = data.departure_time?.trim();
    return {
      tripId: data.trip_id.trim(),
      stopSequence: data.stop_sequence,
      stopId: data.stop_id.trim(),
      arrivalTime: rawArr && rawArr.length > 0 ? rawArr : null,
      departureTime: rawDep && rawDep.length > 0 ? rawDep : null,
      isTimepoint: data.timepoint === 1,
      deferredFields: {
        stopHeadsign: data.stop_headsign?.trim() || null,
        pickupType: data.pickup_type ?? null,
        dropOffType: data.drop_off_type ?? null,
        shapeDistTraveled: data.shape_dist_traveled ?? null,
      },
    };
  });

// ---------------------------------------------------------------------------
// 7. Monotonicity & Timing Rule Checkers
// ---------------------------------------------------------------------------
export function validateStopSequenceMonotonicity(
  stops: { tripId: string; stopSequence: number }[]
): void {
  const lastSequenceByTrip = new Map<string, number>();

  for (const s of stops) {
    const prev = lastSequenceByTrip.get(s.tripId);
    if (prev !== undefined) {
      if (s.stopSequence === prev) {
        throw new DuplicateStopSequenceError(
          `Duplicate stop_sequence ${s.stopSequence} in trip "${s.tripId}"`
        );
      }
      if (s.stopSequence < prev) {
        throw new NonMonotonicStopSequenceError(
          `Descending stop_sequence from ${prev} to ${s.stopSequence} in trip "${s.tripId}"`
        );
      }
    }
    lastSequenceByTrip.set(s.tripId, s.stopSequence);
  }
}

export function validateTripTimingRules(
  stops: {
    tripId: string;
    stopSequence: number;
    stopId: string;
    arrivalTime: string | null;
    departureTime: string | null;
    isTimepoint: boolean;
  }[]
): void {
  // Sort or assume sorted
  const sorted = [...stops].sort((a, b) => a.stopSequence - b.stopSequence);
  if (sorted.length === 0) return;

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    // 1. timepoint=1 requires both arrival and departure times
    if (s.isTimepoint && (!s.arrivalTime || !s.departureTime)) {
      throw new InvalidTimingRuleError(
        `timepoint=1 requires both arrival_time and departure_time at sequence ${s.stopSequence}`
      );
    }
    // 2. First stop requires departure time
    if (i === 0 && !s.departureTime) {
      throw new InvalidTimingRuleError(
        `First stop of trip requires departure_time at sequence ${s.stopSequence}`
      );
    }
    // 3. Last stop requires arrival time
    if (i === sorted.length - 1 && !s.arrivalTime) {
      throw new InvalidTimingRuleError(
        `Last stop of trip requires arrival_time at sequence ${s.stopSequence}`
      );
    }
  }
}
