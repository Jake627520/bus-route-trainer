import { describe, it, expect } from 'vitest';
import { ServiceCalendar, CalendarException, ExceptionType } from '@/domain/service/service-calendar';

describe('ServiceCalendar Domain Entity', () => {
  const weekdayCalendar = new ServiceCalendar({
    serviceId: 'SERV_WEEKDAY',
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
    startDate: '20260901',
    endDate: '20260930',
  });

  describe('Standard weekday evaluation within range', () => {
    it('operates on a valid Wednesday within range (2026-09-02)', () => {
      // 2026-09-02 is Wednesday
      expect(weekdayCalendar.isOperatingOnDate(new Date(2026, 8, 2))).toBe(true);
    });

    it('does not operate on a Saturday within range (2026-09-05)', () => {
      // 2026-09-05 is Saturday
      expect(weekdayCalendar.isOperatingOnDate(new Date(2026, 8, 5))).toBe(false);
    });

    it('does not operate before startDate (2026-08-31)', () => {
      expect(weekdayCalendar.isOperatingOnDate(new Date(2026, 7, 31))).toBe(false);
    });

    it('does not operate after endDate (2026-10-01)', () => {
      expect(weekdayCalendar.isOperatingOnDate(new Date(2026, 9, 1))).toBe(false);
    });
  });

  describe('Calendar exceptions override regular schedule (precedence rule)', () => {
    it('Type 1 (ADDED) forces service to operate even if regular calendar is false (e.g. Saturday special run)', () => {
      const specialSaturday = new CalendarException({
        serviceId: 'SERV_WEEKDAY',
        date: '20260905',
        exceptionType: ExceptionType.ADDED,
      });

      const calendarWithException = weekdayCalendar.withException(specialSaturday);
      // Regular Saturday is false, but exception ADD makes it true
      expect(calendarWithException.isOperatingOnDate(new Date(2026, 8, 5))).toBe(true);
    });

    it('Type 2 (REMOVED) cancels service even if regular calendar is true (e.g. Public Holiday Monday)', () => {
      const holidayMonday = new CalendarException({
        serviceId: 'SERV_WEEKDAY',
        date: '20260907', // Monday
        exceptionType: ExceptionType.REMOVED,
      });

      const calendarWithException = weekdayCalendar.withException(holidayMonday);
      // Regular Monday is true, but exception REMOVE makes it false
      expect(calendarWithException.isOperatingOnDate(new Date(2026, 8, 7))).toBe(false);
    });

    it('exception overrides operate even if date is outside regular startDate / endDate window', () => {
      const extraDay = new CalendarException({
        serviceId: 'SERV_WEEKDAY',
        date: '20261005', // Outside range
        exceptionType: ExceptionType.ADDED,
      });

      const calendar = weekdayCalendar.withException(extraDay);
      expect(calendar.isOperatingOnDate(new Date(2026, 9, 5))).toBe(true);
    });
  });

  describe('Validation', () => {
    it('rejects invalid date format in calendar', () => {
      expect(() => {
        new ServiceCalendar({
          serviceId: 'TEST',
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: false,
          sunday: false,
          startDate: '2026-09-01', // invalid format (expected YYYYMMDD)
          endDate: '20260930',
        });
      }).toThrow(/startDate must be in YYYYMMDD format/);
    });
  });
});
