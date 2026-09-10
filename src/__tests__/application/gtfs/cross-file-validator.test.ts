import { describe, it, expect } from 'vitest';
import {
  CrossFileValidator,
  DuplicateFeedRecordError,
  ImportConflictError,
  ReferentialIntegrityError,
} from '@/application/gtfs/cross-file-validator';

describe('Pass 1 Cross-File Referential Validator & Same-Feed Duplicate Rejection', () => {
  it('passes on clean, consistent feed', () => {
    const validator = new CrossFileValidator();
    validator.registerAgency('TRANS_QLD');
    validator.registerRoute('R66', 'TRANS_QLD', { shortName: '66' });
    validator.registerStop('ST_01');
    validator.registerStop('ST_02');
    validator.registerCalendar('SERV_WD');
    validator.registerCalendarDate('SERV_HOLIDAY', '20260907');
    validator.registerTrip('T66_01', 'R66', 'SERV_WD');
    validator.registerStopTime('T66_01', 1, 'ST_01', { arrival: '08:00:00' });
    validator.registerStopTime('T66_01', 2, 'ST_02', { arrival: '08:30:00' });

    expect(() => validator.finalize()).not.toThrow();
  });

  it('rejects route with mismatched agency_id', () => {
    const validator = new CrossFileValidator();
    validator.registerAgency('TRANS_QLD');
    expect(() => validator.registerRoute('R66', 'UNKNOWN_AGENCY', {})).toThrow(
      ReferentialIntegrityError
    );
  });

  it('rejects trip referencing non-existent route_id', () => {
    const validator = new CrossFileValidator();
    validator.registerAgency('TRANS_QLD');
    validator.registerCalendar('SERV_WD');
    validator.registerTrip('T1', 'NON_EXISTENT_ROUTE', 'SERV_WD');

    expect(() => validator.finalize()).toThrow(/Trip "T1" references unknown routeId/);
  });

  it('rejects trip referencing non-existent service_id (Service ID Union check)', () => {
    const validator = new CrossFileValidator();
    validator.registerAgency('TRANS_QLD');
    validator.registerRoute('R66', 'TRANS_QLD', {});
    validator.registerTrip('T1', 'R66', 'UNKNOWN_SERVICE');

    expect(() => validator.finalize()).toThrow(
      /Trip "T1" references unknown serviceId "UNKNOWN_SERVICE"/
    );
  });

  it('passes Case B where service_id is defined solely by calendar_dates', () => {
    const validator = new CrossFileValidator();
    validator.registerAgency('TRANS_QLD');
    validator.registerRoute('R66', 'TRANS_QLD', {});
    validator.registerCalendarDate('SERV_CASE_B', '20260901');
    validator.registerTrip('T1', 'R66', 'SERV_CASE_B');

    expect(() => validator.finalize()).not.toThrow();
  });

  it('rejects stop_time referencing non-existent trip_id', () => {
    const validator = new CrossFileValidator();
    validator.registerAgency('TRANS_QLD');
    validator.registerRoute('R66', 'TRANS_QLD', {});
    validator.registerStop('ST_01');
    validator.registerStopTime('UNKNOWN_TRIP', 1, 'ST_01', {});

    expect(() => validator.finalize()).toThrow(/StopTime references unknown tripId "UNKNOWN_TRIP"/);
  });

  it('rejects stop_time referencing non-existent stop_id', () => {
    const validator = new CrossFileValidator();
    validator.registerAgency('TRANS_QLD');
    validator.registerRoute('R66', 'TRANS_QLD', {});
    validator.registerCalendar('S1');
    validator.registerTrip('T1', 'R66', 'S1');
    validator.registerStopTime('T1', 1, 'UNKNOWN_STOP', {});

    expect(() => validator.finalize()).toThrow(/StopTime references unknown stopId "UNKNOWN_STOP"/);
  });

  describe('Same-feed duplicate and conflict rejection', () => {
    it('rejects same-feed duplicate primary key with identical payload (DuplicateFeedRecordError)', () => {
      const validator = new CrossFileValidator();
      validator.registerAgency('TRANS_QLD');
      validator.registerRoute('R66', 'TRANS_QLD', { name: 'Bus 66' });
      expect(() => validator.registerRoute('R66', 'TRANS_QLD', { name: 'Bus 66' })).toThrow(
        DuplicateFeedRecordError
      );
    });

    it('rejects same-feed duplicate primary key with conflicting payload (ImportConflictError)', () => {
      const validator = new CrossFileValidator();
      validator.registerAgency('TRANS_QLD');
      validator.registerRoute('R66', 'TRANS_QLD', { name: 'Bus 66' });
      expect(() => validator.registerRoute('R66', 'TRANS_QLD', { name: 'Bus 66X' })).toThrow(
        ImportConflictError
      );
    });

    it('rejects same-feed duplicate composite key in stop_times (DuplicateFeedRecordError)', () => {
      const validator = new CrossFileValidator();
      validator.registerAgency('TRANS_QLD');
      validator.registerRoute('R66', 'TRANS_QLD', {});
      validator.registerStop('ST_01');
      validator.registerStopTime('T1', 1, 'ST_01', { arr: '08:00' });
      expect(() => validator.registerStopTime('T1', 1, 'ST_01', { arr: '08:00' })).toThrow(
        DuplicateFeedRecordError
      );
    });

    it('rejects same-feed duplicate calendar service_id with identical payload (DuplicateFeedRecordError)', () => {
      const validator = new CrossFileValidator();
      validator.registerCalendar('SERV_01', { monday: true });
      expect(() => validator.registerCalendar('SERV_01', { monday: true })).toThrow(
        DuplicateFeedRecordError
      );
    });

    it('rejects same-feed duplicate calendar service_id with conflicting payload (ImportConflictError)', () => {
      const validator = new CrossFileValidator();
      validator.registerCalendar('SERV_01', { monday: true });
      expect(() => validator.registerCalendar('SERV_01', { monday: false })).toThrow(
        ImportConflictError
      );
    });

    it('rejects same-feed duplicate calendar_dates (service_id, date) with identical payload (DuplicateFeedRecordError)', () => {
      const validator = new CrossFileValidator();
      validator.registerCalendarDate('SERV_01', '20260901', { exceptionType: 1 });
      expect(() => validator.registerCalendarDate('SERV_01', '20260901', { exceptionType: 1 })).toThrow(
        DuplicateFeedRecordError
      );
    });

    it('rejects same-feed duplicate calendar_dates (service_id, date) with conflicting payload (ImportConflictError)', () => {
      const validator = new CrossFileValidator();
      validator.registerCalendarDate('SERV_01', '20260901', { exceptionType: 1 });
      expect(() => validator.registerCalendarDate('SERV_01', '20260901', { exceptionType: 2 })).toThrow(
        ImportConflictError
      );
    });
  });
});

