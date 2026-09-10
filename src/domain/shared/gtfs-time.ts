/**
 * GtfsTime Value Object
 *
 * Represents service-day elapsed time for GTFS timetables.
 * Strictly measured in elapsed seconds from the start of the service day (00:00:00 = 0s).
 * Supports standard times (00:00:00 - 23:59:59) and post-midnight service times (e.g. 24:10:00, 25:05:00).
 * Maximum supported service-day hour is 47 (covering extended multi-day operating shifts).
 */
export class GtfsTime {
  public readonly hours: number;
  public readonly minutes: number;
  public readonly seconds: number;
  private readonly totalSeconds: number;

  private constructor(hours: number, minutes: number, seconds: number) {
    this.hours = hours;
    this.minutes = minutes;
    this.seconds = seconds;
    this.totalSeconds = hours * 3600 + minutes * 60 + seconds;
    Object.freeze(this);
  }

  /**
   * Parse a GTFS time string (HH:MM:SS)
   */
  public static fromString(timeStr: string): GtfsTime {
    if (!timeStr || typeof timeStr !== 'string') {
      throw new Error(`Invalid GTFS time string: "${timeStr}"`);
    }

    const trimmed = timeStr.trim();
    const parts = trimmed.split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid GTFS time format (expected HH:MM:SS): "${timeStr}"`);
    }

    const [hStr, mStr, sStr] = parts;
    if (!/^\d+$/.test(hStr) || !/^\d{2}$/.test(mStr) || !/^\d{2}$/.test(sStr)) {
      throw new Error(`Invalid GTFS time digits: "${timeStr}"`);
    }

    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    const seconds = parseInt(sStr, 10);

    if (hours < 0 || hours > 47) {
      throw new Error(`GTFS hour out of valid range (0..47): ${hours}`);
    }
    if (minutes < 0 || minutes > 59) {
      throw new Error(`GTFS minute out of valid range (0..59): ${minutes}`);
    }
    if (seconds < 0 || seconds > 59) {
      throw new Error(`GTFS second out of valid range (0..59): ${seconds}`);
    }

    return new GtfsTime(hours, minutes, seconds);
  }

  /**
   * Construct GtfsTime from service-day elapsed seconds
   */
  public static fromSeconds(totalSecs: number): GtfsTime {
    if (!Number.isInteger(totalSecs) || totalSecs < 0) {
      throw new Error(`Total seconds must be a non-negative integer: ${totalSecs}`);
    }

    const hours = Math.floor(totalSecs / 3600);
    const remainder = totalSecs % 3600;
    const minutes = Math.floor(remainder / 60);
    const seconds = remainder % 60;

    if (hours > 47) {
      throw new Error(`Calculated hours exceed max limit (0..47): ${hours}`);
    }

    return new GtfsTime(hours, minutes, seconds);
  }

  /**
   * Returns total elapsed seconds from the start of the service day
   */
  public toSeconds(): number {
    return this.totalSeconds;
  }

  /**
   * Format as standard GTFS HH:MM:SS string
   */
  public toString(): string {
    const h = String(this.hours).padStart(2, '0');
    const m = String(this.minutes).padStart(2, '0');
    const s = String(this.seconds).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  public isBefore(other: GtfsTime): boolean {
    return this.totalSeconds < other.totalSeconds;
  }

  public isAfter(other: GtfsTime): boolean {
    return this.totalSeconds > other.totalSeconds;
  }

  public equals(other: GtfsTime): boolean {
    return this.totalSeconds === other.totalSeconds;
  }

  public diffSeconds(other: GtfsTime): number {
    return this.totalSeconds - other.totalSeconds;
  }

  public diffMinutes(other: GtfsTime): number {
    return (this.totalSeconds - other.totalSeconds) / 60;
  }
}
