import { describe, it, expect } from 'vitest';
import { GtfsTime } from '@/domain/shared/gtfs-time';

describe('GtfsTime Value Object', () => {
  describe('Valid parsing and elapsed seconds calculation', () => {
    it('parses standard morning time (08:10:00 -> 29400s)', () => {
      const time = GtfsTime.fromString('08:10:00');
      expect(time.toSeconds()).toBe(29400);
      expect(time.hours).toBe(8);
      expect(time.minutes).toBe(10);
      expect(time.seconds).toBe(0);
      expect(time.toString()).toBe('08:10:00');
    });

    it('parses midday time (12:30:00 -> 45000s)', () => {
      const time = GtfsTime.fromString('12:30:00');
      expect(time.toSeconds()).toBe(45000);
      expect(time.toString()).toBe('12:30:00');
    });

    it('parses late night time before midnight (23:59:59 -> 86399s)', () => {
      const time = GtfsTime.fromString('23:59:59');
      expect(time.toSeconds()).toBe(86399);
      expect(time.toString()).toBe('23:59:59');
    });

    it('parses midnight exact (24:00:00 -> 86400s)', () => {
      const time = GtfsTime.fromString('24:00:00');
      expect(time.toSeconds()).toBe(86400);
      expect(time.hours).toBe(24);
      expect(time.minutes).toBe(0);
      expect(time.seconds).toBe(0);
      expect(time.toString()).toBe('24:00:00');
    });

    it('parses post-midnight service time (24:10:00 -> 87000s)', () => {
      const time = GtfsTime.fromString('24:10:00');
      expect(time.toSeconds()).toBe(87000);
      expect(time.hours).toBe(24);
      expect(time.minutes).toBe(10);
      expect(time.seconds).toBe(0);
      expect(time.toString()).toBe('24:10:00');
    });

    it('parses extended early morning service time (25:05:00 -> 90300s)', () => {
      const time = GtfsTime.fromString('25:05:00');
      expect(time.toSeconds()).toBe(90300);
      expect(time.hours).toBe(25);
      expect(time.minutes).toBe(5);
      expect(time.seconds).toBe(0);
      expect(time.toString()).toBe('25:05:00');
    });

    it('constructs correctly from seconds', () => {
      const time = GtfsTime.fromSeconds(87000);
      expect(time.toString()).toBe('24:10:00');
      expect(time.toSeconds()).toBe(87000);
    });
  });

  describe('Comparison and ordering', () => {
    it('compares times correctly with isBefore and isAfter', () => {
      const t1 = GtfsTime.fromString('23:50:00');
      const t2 = GtfsTime.fromString('24:10:00');
      const t3 = GtfsTime.fromString('25:05:00');

      expect(t1.isBefore(t2)).toBe(true);
      expect(t2.isAfter(t1)).toBe(true);
      expect(t2.isBefore(t3)).toBe(true);
      expect(t1.isBefore(t3)).toBe(true);
      expect(t2.isBefore(t2)).toBe(false);
    });

    it('calculates differences in seconds and minutes', () => {
      const t1 = GtfsTime.fromString('08:00:00');
      const t2 = GtfsTime.fromString('08:15:30');

      expect(t2.diffSeconds(t1)).toBe(930);
      expect(t2.diffMinutes(t1)).toBe(15.5);
    });
  });

  describe('Invalid input rejection', () => {
    const invalidFormats = [
      '08:60:00',      // invalid minute
      '08:10:60',      // invalid second
      '-01:00:00',     // negative hour
      'abc',           // non-numeric
      '08:10',         // missing seconds
      '08:10:00:00',   // too many parts
      '25:99:00',      // invalid minute on >24h
      '48:00:00',      // exceeds reasonable service day max (0..47)
      '',              // empty
    ];

    invalidFormats.forEach((val) => {
      it(`throws domain error on invalid time: "${val}"`, () => {
        expect(() => GtfsTime.fromString(val)).toThrow();
      });
    });

    it('rejects negative seconds in fromSeconds', () => {
      expect(() => GtfsTime.fromSeconds(-1)).toThrow();
    });
  });
});
