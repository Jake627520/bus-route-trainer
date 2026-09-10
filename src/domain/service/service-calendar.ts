export enum ExceptionType {
  ADDED = 1,
  REMOVED = 2,
}

export interface CalendarExceptionProps {
  serviceId: string;
  date: string; // YYYYMMDD
  exceptionType: ExceptionType;
}

export class CalendarException {
  public readonly serviceId: string;
  public readonly date: string; // YYYYMMDD
  public readonly exceptionType: ExceptionType;

  constructor(props: CalendarExceptionProps) {
    if (!props.serviceId) {
      throw new Error('serviceId must not be empty');
    }
    if (!/^\d{8}$/.test(props.date)) {
      throw new Error(`Exception date must be in YYYYMMDD format: "${props.date}"`);
    }
    if (props.exceptionType !== ExceptionType.ADDED && props.exceptionType !== ExceptionType.REMOVED) {
      throw new Error(`Invalid exceptionType (must be 1 or 2): ${props.exceptionType}`);
    }

    this.serviceId = props.serviceId;
    this.date = props.date;
    this.exceptionType = props.exceptionType;
    Object.freeze(this);
  }
}

export interface ServiceCalendarProps {
  serviceId: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD
  exceptions?: CalendarException[];
}

/**
 * ServiceCalendar Domain Entity
 *
 * Evaluates whether a service operates on a given date by combining:
 * 1. Calendar date exceptions (ADD / REMOVE) with top precedence.
 * 2. Regular calendar weekday mask and start_date / end_date boundaries.
 */
export class ServiceCalendar {
  public readonly serviceId: string;
  public readonly monday: boolean;
  public readonly tuesday: boolean;
  public readonly wednesday: boolean;
  public readonly thursday: boolean;
  public readonly friday: boolean;
  public readonly saturday: boolean;
  public readonly sunday: boolean;
  public readonly startDate: string;
  public readonly endDate: string;
  private readonly exceptions: Map<string, ExceptionType>;

  constructor(props: ServiceCalendarProps) {
    if (!props.serviceId) {
      throw new Error('serviceId must not be empty');
    }
    if (!/^\d{8}$/.test(props.startDate)) {
      throw new Error(`startDate must be in YYYYMMDD format: "${props.startDate}"`);
    }
    if (!/^\d{8}$/.test(props.endDate)) {
      throw new Error(`endDate must be in YYYYMMDD format: "${props.endDate}"`);
    }

    this.serviceId = props.serviceId;
    this.monday = props.monday;
    this.tuesday = props.tuesday;
    this.wednesday = props.wednesday;
    this.thursday = props.thursday;
    this.friday = props.friday;
    this.saturday = props.saturday;
    this.sunday = props.sunday;
    this.startDate = props.startDate;
    this.endDate = props.endDate;

    this.exceptions = new Map();
    if (props.exceptions) {
      for (const ex of props.exceptions) {
        if (ex.serviceId !== this.serviceId) {
          throw new Error(`Exception serviceId "${ex.serviceId}" does not match "${this.serviceId}"`);
        }
        this.exceptions.set(ex.date, ex.exceptionType);
      }
    }
    Object.freeze(this);
  }

  public withException(exception: CalendarException): ServiceCalendar {
    const existingList: CalendarException[] = [];
    for (const [date, type] of this.exceptions.entries()) {
      if (date !== exception.date) {
        existingList.push(new CalendarException({ serviceId: this.serviceId, date, exceptionType: type }));
      }
    }
    existingList.push(exception);

    return new ServiceCalendar({
      serviceId: this.serviceId,
      monday: this.monday,
      tuesday: this.tuesday,
      wednesday: this.wednesday,
      thursday: this.thursday,
      friday: this.friday,
      saturday: this.saturday,
      sunday: this.sunday,
      startDate: this.startDate,
      endDate: this.endDate,
      exceptions: existingList,
    });
  }

  /**
   * Evaluates if the service runs on the given calendar Date
   */
  public isOperatingOnDate(date: Date): boolean {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}${m}${d}`;

    // 1. Exception Precedence Rule
    if (this.exceptions.has(dateStr)) {
      const type = this.exceptions.get(dateStr);
      return type === ExceptionType.ADDED;
    }

    // 2. Regular date range check (inclusive)
    if (dateStr < this.startDate || dateStr > this.endDate) {
      return false;
    }

    // 3. Regular weekday check (0 = Sunday, 1 = Monday, ...)
    const dayOfWeek = date.getDay();
    switch (dayOfWeek) {
      case 0:
        return this.sunday;
      case 1:
        return this.monday;
      case 2:
        return this.tuesday;
      case 3:
        return this.wednesday;
      case 4:
        return this.thursday;
      case 5:
        return this.friday;
      case 6:
        return this.saturday;
      default:
        return false;
    }
  }
}
