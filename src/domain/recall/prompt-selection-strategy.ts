import { randomUUID } from 'crypto';
import { RecallSession, RecallMode } from './recall-session';
import { RecallPrompt } from './recall-prompt';
import { LearningCard } from '../learning/learning-card';
import { RouteVariantDto } from '../../application/gtfs/gtfs-read-repository.port';
import { generateNextStopCardKey, generateStopCardKey } from '../learning/card-key-generator';
import { normalizeStopName } from './deterministic-evaluator';

export interface PromptSelectionStrategy {
  selectNextPrompt(
    session: RecallSession,
    cards: LearningCard[],
    topology: RouteVariantDto | null,
  ): RecallPrompt | null;
}

export class SequentialTopologyPromptStrategy implements PromptSelectionStrategy {
  constructor(public readonly defaultMode: RecallMode = RecallMode.NEXT_STOP_FORWARD) {}

  selectNextPrompt(
    session: RecallSession,
    _cards: LearningCard[],
    topology: RouteVariantDto | null,
  ): RecallPrompt | null {
    if (!topology || !topology.orderedStops || topology.orderedStops.length === 0) {
      return null;
    }

    const sortedStops = [...topology.orderedStops].sort(
      (a, b) => a.stopSequence - b.stopSequence,
    );

    const mode = session.currentRecallMode ?? this.defaultMode;

    if (mode === RecallMode.NEXT_STOP_FORWARD) {
      const totalPrompts = Math.max(sortedStops.length - 1, 0);
      if (session.currentPromptIndex >= totalPrompts) {
        return null;
      }

      const fromStop = sortedStops[session.currentPromptIndex];
      const toStop = sortedStops[session.currentPromptIndex + 1];
      const cardKey = generateNextStopCardKey(fromStop.stopId, toStop.stopId);

      return new RecallPrompt({
        promptId: randomUUID(),
        sessionId: session.id,
        cardKey,
        promptIndex: session.currentPromptIndex,
        recallMode: RecallMode.NEXT_STOP_FORWARD,
        givenReference: fromStop.stopName,
        expectedAnswer: toStop.stopId,
        createdAt: new Date(),
      });
    }

    if (mode === RecallMode.STOP_NAME_RECOGNITION) {
      const totalPrompts = sortedStops.length;
      if (session.currentPromptIndex >= totalPrompts) {
        return null;
      }

      const stop = sortedStops[session.currentPromptIndex];
      const cardKey = generateStopCardKey(stop.stopId);

      return new RecallPrompt({
        promptId: randomUUID(),
        sessionId: session.id,
        cardKey,
        promptIndex: session.currentPromptIndex,
        recallMode: RecallMode.STOP_NAME_RECOGNITION,
        givenReference: stop.stopId,
        expectedAnswer: normalizeStopName(stop.stopName),
        createdAt: new Date(),
      });
    }

    return null;
  }
}
