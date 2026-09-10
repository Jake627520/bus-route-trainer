export class DuplicateFeedRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateFeedRecordError';
  }
}

export class ImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportConflictError';
  }
}

export class ReferentialIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferentialIntegrityError';
  }
}

/**
 * CrossFileValidator
 *
 * Implements Pass 1 Cross-File Referential Integrity, Service ID Union verification,
 * and Same-Feed Duplicate & Conflict detection.
 *
 * Maintains only lightweight string identifier sets and serialized payloads,
 * keeping memory consumption bounded.
 */
export class CrossFileValidator {
  public validAgencyId: string | null = null;
  private readonly routeMap = new Map<string, string>();
  private readonly stopMap = new Map<string, string>();
  private readonly calendarMap = new Map<string, string>();
  private readonly calendarDateMap = new Map<string, string>();
  private readonly calendarServiceIds = new Set<string>();
  private readonly calendarDateServiceIds = new Set<string>();
  private readonly tripMap = new Map<string, { routeId: string; serviceId: string; payload: string }>();
  private readonly stopTimeMap = new Map<string, string>();
  private readonly pendingStopTimeChecks: { tripId: string; stopId: string }[] = [];

  public registerAgency(agencyId: string): void {
    this.validAgencyId = agencyId;
  }

  public registerRoute(routeId: string, agencyId: string | null, payload: Record<string, unknown>): void {
    // 1. Single-agency referential integrity
    if (this.validAgencyId && agencyId && agencyId !== this.validAgencyId) {
      throw new ReferentialIntegrityError(
        `Route "${routeId}" references agencyId "${agencyId}" which does not match feed agency "${this.validAgencyId}"`
      );
    }

    // 2. Duplicate / Conflict detection
    this.checkDuplicate(this.routeMap, routeId, payload, 'Route');
  }

  public registerStop(stopId: string, payload: Record<string, unknown> = {}): void {
    this.checkDuplicate(this.stopMap, stopId, payload, 'Stop');
  }

  public registerCalendar(serviceId: string, payload: Record<string, unknown> = {}): void {
    this.checkDuplicate(this.calendarMap, serviceId, payload, 'Calendar');
    this.calendarServiceIds.add(serviceId);
  }

  public registerCalendarDate(serviceId: string, date: string, payload: Record<string, unknown> = {}): void {
    const key = `${serviceId}_${date}`;
    this.checkDuplicate(this.calendarDateMap, key, payload, `CalendarDate (${key})`);
    this.calendarDateServiceIds.add(serviceId);
  }

  public registerTrip(
    tripId: string,
    routeId: string,
    serviceId: string,
    payload: Record<string, unknown> = {}
  ): void {
    const serialized = JSON.stringify(payload);
    if (this.tripMap.has(tripId)) {
      const existing = this.tripMap.get(tripId)!;
      if (existing.payload === serialized && existing.routeId === routeId && existing.serviceId === serviceId) {
        throw new DuplicateFeedRecordError(`Duplicate primary key in same feed for Trip "${tripId}"`);
      } else {
        throw new ImportConflictError(`Conflicting payload in same feed for Trip "${tripId}"`);
      }
    }
    this.tripMap.set(tripId, { routeId, serviceId, payload: serialized });
  }

  public registerStopTime(
    tripId: string,
    stopSequence: number,
    stopId: string,
    payload: Record<string, unknown> = {}
  ): void {
    const compositeKey = `${tripId}_${stopSequence}`;
    this.checkDuplicate(this.stopTimeMap, compositeKey, payload, `StopTime (${compositeKey})`);
    this.pendingStopTimeChecks.push({ tripId, stopId });
  }

  private checkDuplicate(
    map: Map<string, string>,
    key: string,
    payload: Record<string, unknown>,
    entityName: string
  ): void {
    const serialized = JSON.stringify(payload);
    if (map.has(key)) {
      const existing = map.get(key)!;
      if (existing === serialized) {
        throw new DuplicateFeedRecordError(`Duplicate primary key in same feed for ${entityName} "${key}"`);
      } else {
        throw new ImportConflictError(`Conflicting payload in same feed for ${entityName} "${key}"`);
      }
    }
    map.set(key, serialized);
  }

  /**
   * Finalizes cross-file referential validation
   */
  public finalize(): void {
    // 1. Service ID Union: calendar ∪ calendar_dates
    const validServiceIds = new Set<string>([
      ...this.calendarServiceIds,
      ...this.calendarDateServiceIds,
    ]);

    // 2. Validate all trips
    for (const [tripId, trip] of this.tripMap.entries()) {
      if (!this.routeMap.has(trip.routeId)) {
        throw new ReferentialIntegrityError(
          `Trip "${tripId}" references unknown routeId "${trip.routeId}"`
        );
      }
      if (!validServiceIds.has(trip.serviceId)) {
        throw new ReferentialIntegrityError(
          `Trip "${tripId}" references unknown serviceId "${trip.serviceId}"`
        );
      }
    }

    // 3. Validate all stop_times references
    for (const check of this.pendingStopTimeChecks) {
      if (!this.tripMap.has(check.tripId)) {
        throw new ReferentialIntegrityError(
          `StopTime references unknown tripId "${check.tripId}"`
        );
      }
      if (!this.stopMap.has(check.stopId)) {
        throw new ReferentialIntegrityError(
          `StopTime references unknown stopId "${check.stopId}"`
        );
      }
    }
  }
}
