import { LearningCard } from './learning-card';

export enum ProgressStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  MASTERED = 'MASTERED',
}

export interface DriverVariantProgressProps {
  id: string; // UUID v4 persistence identifier
  driverId: string; // Driver identifier
  routeId: string; // Soft ref to GTFS route
  directionId: number; // 0 | 1
  targetVariantKey: string; // Current GTFS topology fingerprint
  status?: ProgressStatus;
  enrolledAt?: Date;
  lastStudiedAt?: Date | null;
  cards?: LearningCard[];
}

export class DriverVariantProgress {
  public readonly id: string;
  public readonly driverId: string;
  public readonly routeId: string;
  public readonly directionId: number;
  public readonly targetVariantKey: string;
  public readonly status: ProgressStatus;
  public readonly enrolledAt: Date;
  public readonly lastStudiedAt: Date | null;
  public readonly cards: readonly LearningCard[];

  constructor(props: DriverVariantProgressProps) {
    if (!props.id) throw new Error('progress id must not be empty');
    if (!props.driverId) throw new Error('driverId must not be empty');
    if (!props.routeId) throw new Error('routeId must not be empty');
    if (props.directionId !== 0 && props.directionId !== 1) {
      throw new Error('directionId must be 0 or 1');
    }
    if (!props.targetVariantKey) throw new Error('targetVariantKey must not be empty');

    const status = props.status ?? ProgressStatus.NOT_STARTED;
    if (!Object.values(ProgressStatus).includes(status)) {
      throw new Error(`invalid ProgressStatus: ${status}`);
    }

    this.id = props.id;
    this.driverId = props.driverId;
    this.routeId = props.routeId;
    this.directionId = props.directionId;
    this.targetVariantKey = props.targetVariantKey;
    this.status = status;
    this.enrolledAt = props.enrolledAt ?? new Date();
    this.lastStudiedAt = props.lastStudiedAt ?? null;
    this.cards = Object.freeze(props.cards ? [...props.cards] : []);

    Object.freeze(this);
  }
}
