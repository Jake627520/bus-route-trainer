import { SessionStatus } from '@/domain/recall/recall-session';

export interface SessionStateData {
  readonly id: string;
  readonly driverId: string;
  readonly routeId: string;
  readonly targetVariantKey: string;
  readonly status: SessionStatus;
  readonly currentPromptIndex: number;
  readonly totalCards: number;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly abandonedAt: Date | null;
}

export interface GetRecallSessionStatePort {
  findSessionById(sessionId: string): Promise<SessionStateData | null>;
}
