import { describe, it, expect } from 'vitest';
import {
  validateAgencyRows,
  routeRowSchema,
  stopRowSchema,
  calendarRowSchema,
  calendarDateRowSchema,
  tripRowSchema,
  stopTimeRowSchema,
  validateStopSequenceMonotonicity,
  validateTripTimingRules,
  UnsupportedMultiAgencyFeedError,
  DuplicateStopSequenceError,
  NonMonotonicStopSequenceError,
} from '@/infrastructure/gtfs/parser/gtfs-row-schemas';

describe('GTFS Row Schemas & Validation Rules', () => {
  describe('Agency validation & Single-Agency Profile', () => {
    it('accepts a valid single-agency feed with explicit agency_id', () => {
      const rows = [
        {
          agency_id: 'TRANS_QLD',
          agency_name: 'Translink Queensland',
          agency_url: 'https://translink.com.au',
          agency_timezone: 'Australia/Brisbane',
        },
      ];
      const agency = validateAgencyRows(rows);
      expect(agency.id).toBe('TRANS_QLD');
      expect(agency.name).toBe('Translink Queensland');
    });

    it('assigns DEFAULT_AGENCY when agency_id is omitted in single-agency feed', () => {
      const rows = [
        {
          agency_id: '',
          agency_name: 'Translink Queensland',
          agency_url: 'https://translink.com.au',
          agency_timezone: 'Australia/Brisbane',
        },
      ];
      const agency = validateAgencyRows(rows);
      expect(agency.id).toBe('DEFAULT_AGENCY');
    });

    it('rejects multi-agency feeds with UnsupportedMultiAgencyFeedError', () => {
      const rows = [
        { agency_id: 'A1', agency_name: 'Agency 1', agency_url: 'https://a1.com', agency_timezone: 'Australia/Brisbane' },
        { agency_id: 'A2', agency_name: 'Agency 2', agency_url: 'https://a2.com', agency_timezone: 'Australia/Brisbane' },
      ];
      expect(() => validateAgencyRows(rows)).toThrow(UnsupportedMultiAgencyFeedError);
    });

    it('rejects feed with zero agency rows', () => {
      expect(() => validateAgencyRows([])).toThrow();
    });
  });

  describe('Route row validation', () => {
    it('parses valid route with agency_id', () => {
      const parsed = routeRowSchema.parse({
        route_id: 'R66',
        agency_id: 'TRANS_QLD',
        route_short_name: '66',
        route_long_name: 'RBWH - UQ Lakes',
        route_type: '3',
      });
      expect(parsed.id).toBe('R66');
      expect(parsed.agencyId).toBe('TRANS_QLD');
      expect(parsed.routeType).toBe(3);
    });

    it('rejects route missing both short and long names', () => {
      expect(() =>
        routeRowSchema.parse({
          route_id: 'R66',
          route_type: '3',
        })
      ).toThrow();
    });
  });

  describe('Stop row validation', () => {
    it('parses valid stop with coordinates', () => {
      const parsed = stopRowSchema.parse({
        stop_id: 'ST_01',
        stop_name: 'Cultural Centre',
        stop_lat: '-27.4741',
        stop_lon: '153.0189',
      });
      expect(parsed.id).toBe('ST_01');
      expect(parsed.latitude).toBeCloseTo(-27.4741);
      expect(parsed.longitude).toBeCloseTo(153.0189);
    });

    it('rejects stop with out-of-range coordinates', () => {
      expect(() =>
        stopRowSchema.parse({
          stop_id: 'ST_01',
          stop_name: 'Invalid',
          stop_lat: '999',
          stop_lon: '153',
        })
      ).toThrow();
    });
  });

  describe('Calendar & CalendarDates row validation', () => {
    it('parses calendar weekday mask and dates', () => {
      const parsed = calendarRowSchema.parse({
        service_id: 'SERV_WD',
        monday: '1',
        tuesday: '1',
        wednesday: '1',
        thursday: '1',
        friday: '1',
        saturday: '0',
        sunday: '0',
        start_date: '20260901',
        end_date: '20260930',
      });
      expect(parsed.serviceId).toBe('SERV_WD');
      expect(parsed.monday).toBe(true);
      expect(parsed.saturday).toBe(false);
    });

    it('parses calendar_dates exception (Case A and Case B)', () => {
      const parsed = calendarDateRowSchema.parse({
        service_id: 'SERV_CASE_B',
        date: '20260907',
        exception_type: '1',
      });
      expect(parsed.serviceId).toBe('SERV_CASE_B');
      expect(parsed.date).toBe('20260907');
      expect(parsed.exceptionType).toBe(1);
    });
  });

  describe('Trip row validation', () => {
    it('parses valid trip with nullable optional fields', () => {
      const parsed = tripRowSchema.parse({
        trip_id: 'T66_01',
        route_id: 'R66',
        service_id: 'SERV_WD',
        direction_id: '0',
        trip_headsign: 'UQ Lakes',
        shape_id: '',
      });
      expect(parsed.id).toBe('T66_01');
      expect(parsed.tripHeadsign).toBe('UQ Lakes');
      expect(parsed.shapeId).toBeNull();
    });
  });

  describe('StopTime row validation & timing rules', () => {
    it('parses valid stop_time with >24h elapsed times and deferred fields', () => {
      const parsed = stopTimeRowSchema.parse({
        trip_id: 'T66_01',
        stop_sequence: '23',
        stop_id: 'ST_02',
        arrival_time: '24:10:00',
        departure_time: '24:10:00',
        timepoint: '1',
        stop_headsign: 'Overridden Headsign',
        shape_dist_traveled: '12.5',
      });
      expect(parsed.tripId).toBe('T66_01');
      expect(parsed.stopSequence).toBe(23);
      expect(parsed.arrivalTime).toBe('24:10:00');
      expect(parsed.isTimepoint).toBe(true);
      expect(parsed.deferredFields.stopHeadsign).toBe('Overridden Headsign');
      expect(parsed.deferredFields.shapeDistTraveled).toBe(12.5);
    });

    it('enforces timepoint=1 requires both arrival and departure times', () => {
      const missingDeparture = {
        tripId: 'T1',
        stopSequence: 1,
        stopId: 'S1',
        arrivalTime: '08:00:00',
        departureTime: null,
        isTimepoint: true,
      };
      expect(() => validateTripTimingRules([missingDeparture])).toThrow(
        /timepoint=1 requires both arrival_time and departure_time/
      );
    });

    it('enforces first stop requires departure_time and last stop requires arrival_time', () => {
      const firstStopMissingDep = [
        { tripId: 'T1', stopSequence: 1, stopId: 'S1', arrivalTime: '08:00:00', departureTime: null, isTimepoint: false },
        { tripId: 'T1', stopSequence: 2, stopId: 'S2', arrivalTime: '08:15:00', departureTime: '08:15:00', isTimepoint: false },
      ];
      expect(() => validateTripTimingRules(firstStopMissingDep)).toThrow(
        /First stop of trip requires departure_time/
      );

      const lastStopMissingArr = [
        { tripId: 'T1', stopSequence: 1, stopId: 'S1', arrivalTime: '08:00:00', departureTime: '08:00:00', isTimepoint: false },
        { tripId: 'T1', stopSequence: 2, stopId: 'S2', arrivalTime: null, departureTime: '08:15:00', isTimepoint: false },
      ];
      expect(() => validateTripTimingRules(lastStopMissingArr)).toThrow(
        /Last stop of trip requires arrival_time/
      );
    });
  });

  describe('Stop Sequence Monotonicity', () => {
    it('accepts non-consecutive strictly increasing stop sequences (1, 23, 40)', () => {
      const validSequences = [
        { tripId: 'T1', stopSequence: 1 },
        { tripId: 'T1', stopSequence: 23 },
        { tripId: 'T1', stopSequence: 40 },
      ];
      expect(() => validateStopSequenceMonotonicity(validSequences)).not.toThrow();
    });

    it('rejects duplicate stop sequence within the same trip (1, 23, 23)', () => {
      const duplicates = [
        { tripId: 'T1', stopSequence: 1 },
        { tripId: 'T1', stopSequence: 23 },
        { tripId: 'T1', stopSequence: 23 },
      ];
      expect(() => validateStopSequenceMonotonicity(duplicates)).toThrow(DuplicateStopSequenceError);
    });

    it('rejects descending stop sequence within the same trip (1, 40, 23)', () => {
      const descending = [
        { tripId: 'T1', stopSequence: 1 },
        { tripId: 'T1', stopSequence: 40 },
        { tripId: 'T1', stopSequence: 23 },
      ];
      expect(() => validateStopSequenceMonotonicity(descending)).toThrow(NonMonotonicStopSequenceError);
    });

    it('allows independent stop sequences across different trips (T1: 1, 23, 40; T2: 1, 5, 9)', () => {
      const multiTrip = [
        { tripId: 'T1', stopSequence: 1 },
        { tripId: 'T1', stopSequence: 23 },
        { tripId: 'T1', stopSequence: 40 },
        { tripId: 'T2', stopSequence: 1 },
        { tripId: 'T2', stopSequence: 5 },
        { tripId: 'T2', stopSequence: 9 },
      ];
      expect(() => validateStopSequenceMonotonicity(multiTrip)).not.toThrow();
    });
  });
});
