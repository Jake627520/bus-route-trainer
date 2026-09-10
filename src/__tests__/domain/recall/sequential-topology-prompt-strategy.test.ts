import { describe, it, expect } from 'vitest';
import { SequentialTopologyPromptStrategy } from '../../../domain/recall/prompt-selection-strategy';
import { RecallSession, RecallMode, SessionStatus } from '../../../domain/recall/recall-session';
import { RouteVariantDto } from '../../../application/gtfs/gtfs-read-repository.port';
import { generateCardsForOrderedStops } from '../../../domain/learning/card-key-generator';
import { normalizeStopName } from '../../../domain/recall/deterministic-evaluator';

describe('SequentialTopologyPromptStrategy', () => {
  const createSession = (currentPromptIndex = 0, mode: RecallMode = RecallMode.NEXT_STOP_FORWARD): RecallSession => {
    return new RecallSession({
      id: 'session-123',
      driverId: 'driver-1',
      routeId: 'route-66',
      targetVariantKey: 'route-66:0:hash',
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex,
      currentCardKey: null,
      currentRecallMode: mode,
      currentExpectedAnswer: null,
      currentPromptStartedAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      abandonedAt: null,
    });
  };

  const createTopology = (stops: Array<{ stopId: string; stopName: string; stopSequence: number }>): RouteVariantDto => ({
    variantKey: 'route-66:0:hash',
    routeId: 'route-66',
    directionId: 0,
    headsign: 'City',
    stopCount: stops.length,
    sampleTripId: 'trip-1',
    tripCount: 1,
    orderedStops: stops.map((s) => ({
      stopSequence: s.stopSequence,
      stopId: s.stopId,
      stopName: s.stopName,
      isTimepoint: false,
    })),
  });

  it('selects prompts in forward topological order for NEXT_STOP_FORWARD', () => {
    const strategy = new SequentialTopologyPromptStrategy(RecallMode.NEXT_STOP_FORWARD);
    const topology = createTopology([
      { stopId: 'stop_1', stopName: 'Station 1', stopSequence: 1 },
      { stopId: 'stop_2', stopName: 'Station 2', stopSequence: 2 },
      { stopId: 'stop_3', stopName: 'Station 3', stopSequence: 3 },
    ]);
    const cards = generateCardsForOrderedStops('progress-1', ['stop_1', 'stop_2', 'stop_3']);

    // Prompt 0 (Station 1 -> Station 2)
    const session0 = createSession(0);
    const prompt0 = strategy.selectNextPrompt(session0, cards, topology);
    expect(prompt0).not.toBeNull();
    expect(prompt0?.promptIndex).toBe(0);
    expect(prompt0?.cardKey).toBe('NEXT_STOP::stop_1->stop_2');
    expect(prompt0?.expectedAnswer).toBe('stop_2');
    expect(prompt0?.recallMode).toBe(RecallMode.NEXT_STOP_FORWARD);

    // Prompt 1 (Station 2 -> Station 3)
    const session1 = createSession(1);
    const prompt1 = strategy.selectNextPrompt(session1, cards, topology);
    expect(prompt1).not.toBeNull();
    expect(prompt1?.promptIndex).toBe(1);
    expect(prompt1?.cardKey).toBe('NEXT_STOP::stop_2->stop_3');
    expect(prompt1?.expectedAnswer).toBe('stop_3');
  });

  it('handles boundary single-stop variant: 1 STOP prompt, 0 NEXT_STOP prompts', () => {
    const topology = createTopology([
      { stopId: 'stop_solo', stopName: 'Solo Stop', stopSequence: 1 },
    ]);
    const cards = generateCardsForOrderedStops('progress-1', ['stop_solo']);

    // NEXT_STOP_FORWARD with 1 stop should yield 0 prompts
    const nextStopStrategy = new SequentialTopologyPromptStrategy(RecallMode.NEXT_STOP_FORWARD);
    const sessionNext = createSession(0, RecallMode.NEXT_STOP_FORWARD);
    expect(nextStopStrategy.selectNextPrompt(sessionNext, cards, topology)).toBeNull();

    // STOP_NAME_RECOGNITION with 1 stop should yield exactly 1 prompt
    const stopNameStrategy = new SequentialTopologyPromptStrategy(RecallMode.STOP_NAME_RECOGNITION);
    const sessionStop0 = createSession(0, RecallMode.STOP_NAME_RECOGNITION);
    const prompt = stopNameStrategy.selectNextPrompt(sessionStop0, cards, topology);
    expect(prompt).not.toBeNull();
    expect(prompt?.promptIndex).toBe(0);
    expect(prompt?.cardKey).toBe('STOP::stop_solo');
    expect(prompt?.expectedAnswer).toBe(normalizeStopName('Solo Stop'));

    // After index 0, returns null
    const sessionStop1 = createSession(1, RecallMode.STOP_NAME_RECOGNITION);
    expect(stopNameStrategy.selectNextPrompt(sessionStop1, cards, topology)).toBeNull();
  });

  it('handles two-stop variant (produces exactly 1 NEXT_STOP prompt)', () => {
    const strategy = new SequentialTopologyPromptStrategy(RecallMode.NEXT_STOP_FORWARD);
    const topology = createTopology([
      { stopId: 'stop_a', stopName: 'Alpha', stopSequence: 1 },
      { stopId: 'stop_b', stopName: 'Beta', stopSequence: 2 },
    ]);
    const cards = generateCardsForOrderedStops('progress-1', ['stop_a', 'stop_b']);

    const session0 = createSession(0);
    const prompt0 = strategy.selectNextPrompt(session0, cards, topology);
    expect(prompt0).not.toBeNull();
    expect(prompt0?.promptIndex).toBe(0);
    expect(prompt0?.expectedAnswer).toBe('stop_b');

    // Index 1 (terminus) generates no prompt
    const session1 = createSession(1);
    expect(strategy.selectNextPrompt(session1, cards, topology)).toBeNull();
  });

  it('final stop boundary behavior: no NEXT_STOP prompt generated for terminus', () => {
    const strategy = new SequentialTopologyPromptStrategy(RecallMode.NEXT_STOP_FORWARD);
    const topology = createTopology([
      { stopId: 'stop_1', stopName: 'Start', stopSequence: 1 },
      { stopId: 'stop_2', stopName: 'Middle', stopSequence: 2 },
      { stopId: 'stop_3', stopName: 'Terminus', stopSequence: 3 },
    ]);
    const cards = generateCardsForOrderedStops('progress-1', ['stop_1', 'stop_2', 'stop_3']);

    // 3 stops -> prompts at index 0 and index 1.
    // Index 2 is terminus -> null
    const sessionTerminus = createSession(2);
    expect(strategy.selectNextPrompt(sessionTerminus, cards, topology)).toBeNull();
  });

  it('returns null when prompts are exhausted or topology is null', () => {
    const strategy = new SequentialTopologyPromptStrategy(RecallMode.NEXT_STOP_FORWARD);
    const topology = createTopology([
      { stopId: 'stop_1', stopName: 'Start', stopSequence: 1 },
      { stopId: 'stop_2', stopName: 'Terminus', stopSequence: 2 },
    ]);
    const cards = generateCardsForOrderedStops('progress-1', ['stop_1', 'stop_2']);

    expect(strategy.selectNextPrompt(createSession(5), cards, topology)).toBeNull();
    expect(strategy.selectNextPrompt(createSession(0), cards, null)).toBeNull();
  });
});
